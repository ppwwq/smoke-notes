package app.jotday.calendar;

import android.content.*;
import android.database.Cursor;
import android.database.sqlite.*;
import org.json.*;
import java.util.*;

final class PlannerStore extends SQLiteOpenHelper {
    final String workspace;
    PlannerStore(Context context, String workspace) { super(context, "planner-"+workspace+".db",null,1); this.workspace=workspace; }
    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE records(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id))");
        db.execSQL("CREATE TABLE states(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(kind,id))");
        db.execSQL("CREATE TABLE conflicts(id TEXT PRIMARY KEY,body TEXT NOT NULL)");
        db.execSQL("CREATE TABLE drafts(id TEXT PRIMARY KEY,body TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db,int old,int next) { throw new IllegalStateException("Unsupported database upgrade"); }
    synchronized JSONObject get(String kind,String id) { return read("records",kind,id); }
    synchronized JSONObject state(String kind,String id) { return read("states",kind,id); }
    private JSONObject read(String table,String kind,String id) {
        try(Cursor c=getReadableDatabase().query(table,new String[]{"body"},"kind=? AND id=?",new String[]{kind,id},null,null,null)) {
            return c.moveToFirst()?Json.object(c.getString(0)):null;
        }
    }
    synchronized List<JSONObject> all(String kind) { return list("records",kind); }
    synchronized List<JSONObject> states(String kind) { return list("states",kind); }
    private List<JSONObject> list(String table,String kind) {
        List<JSONObject> result=new ArrayList<>();
        try(Cursor c=getReadableDatabase().query(table,new String[]{"body"},"kind=?",new String[]{kind},null,null,"id")) { while(c.moveToNext()) result.add(Json.object(c.getString(0))); }
        return result;
    }
    synchronized void put(String kind,JSONObject payload) { write("records",kind,payload.optString("id"),payload); }
    synchronized void putState(String kind,String id,JSONObject state) { write("states",kind,id,state); }
    private void write(String table,String kind,String id,JSONObject value) {
        ContentValues row=new ContentValues(); row.put("kind",kind);row.put("id",id);row.put("body",value.toString());
        getWritableDatabase().insertWithOnConflict(table,null,row,SQLiteDatabase.CONFLICT_REPLACE);
    }
    synchronized void remove(String kind,String id) { getWritableDatabase().delete("records","kind=? AND id=?",new String[]{kind,id}); }
    synchronized void conflict(String id,JSONObject body) { saveSingle("conflicts",id,body); }
    synchronized void draft(JSONObject body) { saveSingle("drafts","editor",body); }
    synchronized JSONObject draft() {
        try(Cursor c=getReadableDatabase().rawQuery("SELECT body FROM drafts WHERE id='editor'",null)) { return c.moveToFirst()?Json.object(c.getString(0)):null; }
    }
    synchronized void clearDraft() { getWritableDatabase().delete("drafts","id='editor'",null); }
    synchronized JSONArray conflicts() {
        JSONArray a=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT body FROM conflicts",null)) { while(c.moveToNext()) a.put(Json.object(c.getString(0))); }
        return a;
    }
    private void saveSingle(String table,String id,JSONObject body) {
        ContentValues row=new ContentValues();row.put("id",id);row.put("body",body.toString());
        getWritableDatabase().insertWithOnConflict(table,null,row,SQLiteDatabase.CONFLICT_REPLACE);
    }
    synchronized void transaction(Runnable task) {
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();try { task.run();db.setTransactionSuccessful(); } finally { db.endTransaction(); }
    }
    synchronized void adoptFrom(PlannerStore source) {
        transaction(()-> { for(String kind:new String[]{"type","event","link"}) for(JSONObject value:source.all(kind)) {
            JSONObject copy=Json.copy(value);Json.put(copy,"workspaceId",workspace);
            if(kind.equals("link")) Json.put(copy,"id",workspace+":"+copy.optString("todoId"));
            put(kind,copy);
        }});
    }
}
