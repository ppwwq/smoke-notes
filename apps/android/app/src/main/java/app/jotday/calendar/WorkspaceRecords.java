package app.jotday.calendar;

import org.json.*;
import java.time.*;
import java.util.*;

/** The SQLite representation keeps the server's field names, including planning. */
final class WorkspaceRecords {
    static final String[] KINDS={"notebook","note","todo"};
    static boolean alive(JSONObject row) { return row!=null&&Json.str(row,"deleted_at").isEmpty(); }
    static boolean purged(JSONObject row) {
        if (row == null) return false;
        try { return Instant.EPOCH.equals(Instant.parse(Json.str(row,"deleted_at"))); }
        catch (java.time.format.DateTimeParseException ignored) { return false; }
    }
    static void purge(PlannerStore store, String kind, JSONObject row) {
        if (purged(row)) return;
        if (kind.equals("notebook")) {
            for (JSONObject note : store.all("note"))
                if (row.optString("id").equals(note.optString("notebook_id"))) purge(store,"note",note);
            Json.put(row,"name","已彻底删除");
        } else if (kind.equals("note")) {
            Json.put(row,"title",""); Json.put(row,"body","");
            Json.put(row,"content_json",Json.obj("type","doc","content",new JSONArray()));
            Json.put(row,"conflict_of",null);
        } else {
            Json.put(row,"text","已彻底删除"); Json.put(row,"completed",false);
            if (row.optJSONObject("planning") != null) Json.put(row,"planning",Json.obj("version",1,"kind","task"));
        }
        Json.put(row,"deleted_at",Instant.EPOCH.toString());
        save(store,kind,row);
    }
    static JSONObject create(String kind,String workspace) {
        JSONObject row=Json.obj("id",UUID.randomUUID().toString(),"version",0,"updated_at",Instant.now().toString(),"deleted_at",null,"rank",System.currentTimeMillis());
        if(!kind.equals("note"))Json.put(row,"workspace_id",workspace);
        return row;
    }
    static JSONObject payload(String kind,JSONObject row) {
        if(row==null)return null;
        JSONObject p=Json.obj("id",row.optString("id"),"rank",row.optDouble("rank",0),"deletedAt",row.opt("deleted_at"));
        if(kind.equals("notebook")){Json.put(p,"workspaceId",row.optString("workspace_id"));Json.put(p,"name",row.optString("name"));}
        else if(kind.equals("note")){
            Json.put(p,"notebookId",row.optString("notebook_id"));Json.put(p,"title",row.optString("title"));Json.put(p,"body",row.optString("body"));
            Json.put(p,"contentJson",row.optJSONObject("content_json"));Json.put(p,"color",row.optString("color","amber"));Json.put(p,"kind",row.optString("kind","note"));Json.put(p,"conflictOf",row.opt("conflict_of"));
        }else{Json.put(p,"workspaceId",row.optString("workspace_id"));Json.put(p,"text",row.optString("text"));Json.put(p,"completed",row.optBoolean("completed"));if(row.has("planning"))Json.put(p,"planning",row.opt("planning"));}
        return p;
    }
    static boolean same(String kind,JSONObject a,JSONObject b){return Json.same(payload(kind,a),payload(kind,b));}
    static void save(PlannerStore store,String kind,JSONObject row){store.transaction(()->{String id=row.optString("id");if(store.state("workspace:"+kind,id)==null){JSONObject prior=store.get(kind,id);store.putState("workspace:"+kind,id,Json.obj("id",id,"version",prior==null?0:prior.optInt("version"),"snapshot",prior));}Json.put(row,"updated_at",Instant.now().toString());store.put(kind,row);});}
    static List<JSONObject> visible(PlannerStore store,String kind){List<JSONObject> list=new ArrayList<>();for(JSONObject r:store.all(kind))if(alive(r))list.add(r);list.sort(Comparator.comparingDouble(r->r.optDouble("rank")));return list;}
    static LocalDate today(PlannerStore store){int boundary=0;for(JSONObject row:store.all("todo")){JSONObject p=row.optJSONObject("planning");if(alive(row)&&p!=null&&p.optString("kind").equals("settings")&&p.optJSONObject("settings")!=null)boundary=p.optJSONObject("settings").optInt("dayBoundaryHour");}return ZonedDateTime.now(CalendarProjector.ZONE).minusHours(boundary).toLocalDate();}
    static JSONObject task(PlannerStore store,String text,LocalDate date,String notes){JSONObject row=create("todo",store.workspace);Json.put(row,"text",text);Json.put(row,"completed",false);Json.put(row,"planning",Json.obj("version",1,"kind","task","date",date.toString(),"notes",notes,"status","open","completedAt",null));return row;}
    static JSONObject explicit(JSONObject projected,PlannerStore store){
        JSONObject row=Json.copy(projected);JSONObject p=row.optJSONObject("planning");
        if(p==null){p=Json.obj("version",1,"kind","task","date",today(store).toString());Json.put(row,"planning",p);}
        Json.put(p,"version",1);if(!p.has("kind"))Json.put(p,"kind","task");Json.put(p,"generated",false);
        Json.put(row,"workspace_id",store.workspace);if(!row.has("rank"))Json.put(row,"rank",System.currentTimeMillis());if(!row.has("version"))Json.put(row,"version",0);if(!row.has("deleted_at"))Json.put(row,"deleted_at",null);
        return row;
    }
    static void stamp(JSONObject planning,String... fields){JSONObject clocks=planning.optJSONObject("clocks");if(clocks==null)clocks=Json.obj();for(String field:fields)Json.put(clocks,field,Json.obj("at",Instant.now().toString(),"id",UUID.randomUUID().toString()));Json.put(planning,"clocks",clocks);}
    static void status(PlannerStore store,JSONObject projected,String status){
        JSONObject current=store.get("todo",projected.optString("id"));if(current!=null&&!alive(current))return;
        JSONObject row=explicit(current==null?projected:current,store),p=row.optJSONObject("planning");String now=Instant.now().toString();
        Json.put(row,"completed",status.equals("completed"));Json.put(p,"status",status);Json.put(p,"completedAt",status.equals("completed")?now:null);stamp(p,"status");
        JSONArray events=p.optJSONArray("events");if(events==null)events=new JSONArray();events.put(Json.obj("id",UUID.randomUUID().toString(),"at",now,"status",status,"completedAt",status.equals("completed")?now:null));Json.put(p,"events",events);save(store,"todo",row);
    }
    static void reconcile(PlannerStore store){store.transaction(()->{LocalDate today=today(store);for(JSONObject series:store.all("todo")){JSONObject plan=series.optJSONObject("planning");if(!alive(series)||plan==null||!plan.optString("kind").equals("series"))continue;JSONArray revisions=plan.optJSONArray("revisions");if(revisions==null)continue;List<JSONObject> rules=new ArrayList<>();for(int i=0;i<revisions.length();i++)if(revisions.optJSONObject(i)!=null)rules.add(revisions.optJSONObject(i));rules.sort(Comparator.comparing((JSONObject r)->r.optString("effectiveFrom")).thenComparing(r->r.optString("changedAt")).thenComparing(r->r.optString("id")));if(rules.isEmpty())continue;
        LocalDate start;try{start=LocalDate.parse(rules.get(0).optString("effectiveFrom"));}catch(Exception ignored){continue;}if(start.getYear()<1900)continue;
        int index=0;for(LocalDate day=start;!day.isAfter(today);day=day.plusDays(1)){String date=day.toString();while(index+1<rules.size()&&rules.get(index+1).optString("effectiveFrom").compareTo(date)<=0)index++;JSONObject rule=rules.get(index),repeat=rule.optJSONObject("repeat");if(repeat==null)continue;int weekday=day.getDayOfWeek().getValue()%7;String kind=repeat.optString("kind");boolean occurs=!rule.optBoolean("paused")&&!rule.optBoolean("stopped")&&(kind.equals("daily")||kind.equals("weekdays")&&weekday>=1&&weekday<=5||kind.equals("weekly")&&CalendarProjector.contains(repeat.optJSONArray("weekdays"),weekday));String id=CalendarProjector.todoId(series.optString("id"),date);JSONObject prior=store.get("todo",id),p=prior==null?null:prior.optJSONObject("planning");
            if(prior!=null&&(!alive(prior)||p==null||!p.optBoolean("generated")))continue;
            if(prior!=null&&rule.optString("id").equals(p.optString("sourceRevisionId")))continue;if(prior==null&&!occurs)continue;
            JSONObject row=prior==null?create("todo",store.workspace):Json.copy(prior);Json.put(row,"id",id);Json.put(row,"text",rule.optString("text"));Json.put(row,"rank",series.optDouble("rank"));Json.put(row,"completed",false);JSONObject next=p==null?Json.obj("version",1,"kind","occurrence","seriesId",series.optString("id"),"date",date,"status","open","completedAt",null,"generated",true,"clocks",Json.obj()):Json.copy(p);Json.put(next,"notes",rule.optString("notes"));Json.put(next,"sourceRevisionId",rule.optString("id"));Json.put(next,"sourceRevisionAt",rule.optString("changedAt"));Json.put(next,"ruleSkipped",!occurs);Json.put(row,"planning",next);save(store,"todo",row);
        }
    }});}
}
