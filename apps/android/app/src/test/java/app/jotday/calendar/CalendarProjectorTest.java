package app.jotday.calendar;
import org.junit.Test;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import static org.junit.Assert.*;

public class CalendarProjectorTest {
    @Test public void sharedContract() throws Exception {
        InputStream input=getClass().getResourceAsStream("/calendar-contract.json");assertNotNull(input);
        JSONArray fixtures=new JSONArray(new String(input.readAllBytes(),StandardCharsets.UTF_8));
        for(int i=0;i<fixtures.length();i++) {
            JSONObject f=fixtures.getJSONObject(i),event=Json.obj("id","contract","workspaceId","synthetic","title","synthetic","deletedAt",null,"allDay",false,"timeZone","Asia/Hong_Kong","exceptions",new JSONObject());
            JSONObject fields=f.getJSONObject("event");fields.keys().forEachRemaining(k->Json.put(event,k,fields.opt(k)));
            List<CalendarProjector.Occurrence> actual=CalendarProjector.project(Collections.singletonList(event),LocalDate.parse(f.getString("from")),LocalDate.parse(f.getString("to")));
            JSONArray expected=f.getJSONArray("starts");assertEquals(f.getString("name"),expected.length(),actual.size());
            for(int n=0;n<actual.size();n++)assertEquals(f.getString("name"),expected.getString(n),CalendarProjector.stamp(actual.get(n).start));
        }
    }
    @Test public void fingerprintIgnoresPropertyOrderAndTimestampOnly() {
        assertTrue(Json.same(Json.obj("title","a","updatedAt","x","repeat",Json.obj("interval",1,"frequency","daily")),Json.obj("repeat",Json.obj("frequency","daily","interval",1),"title","a","updatedAt","y")));
        assertFalse(Json.same(Json.obj("title","a"),Json.obj("title","b")));
    }
    @Test public void futureTodoRulesRespectExplicitEditsAndTombstones() {
        String seriesId="test-series";
        JSONObject series=Json.obj("id",seriesId,"planning",Json.obj("kind","series","revisions",new JSONArray().put(Json.obj("id","rule","effectiveFrom","2026-10-01","changedAt","2026-10-01T00:00:00Z","text","Future task","notes","","repeat",Json.obj("kind","daily")))));
        JSONObject deleted=Json.obj("id",CalendarProjector.todoId(seriesId,"2026-10-27"),"deleted_at","2026-10-25T00:00:00Z","planning",Json.obj("date","2026-10-27","kind","occurrence","generated",true));
        JSONObject edited=Json.obj("id",CalendarProjector.todoId(seriesId,"2026-10-28"),"text","My edit","completed",true,"planning",Json.obj("date","2026-10-28","kind","occurrence","generated",false));
        List<JSONObject> result=CalendarProjector.projectTodos(Arrays.asList(series,deleted,edited),LocalDate.parse("2026-10-26"),LocalDate.parse("2026-10-28"),LocalDate.parse("2026-10-25"));
        assertEquals(2,result.size());assertTrue(result.stream().anyMatch(t->t.optString("text").equals("Future task")));assertTrue(result.stream().anyMatch(t->t.optString("text").equals("My edit")&&t.optBoolean("completed")));
    }
}
