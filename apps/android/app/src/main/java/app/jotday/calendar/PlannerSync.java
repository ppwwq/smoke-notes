package app.jotday.calendar;

import org.json.*;
import java.util.*;
import java.time.Instant;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

final class PlannerSync {
    private static final String[] KINDS={"type","event","link"};
    private final PlannerStore store;
    private final CloudClient cloud;
    PlannerSync(PlannerStore store,CloudClient cloud) { this.store=store;this.cloud=cloud; }
    private void scan() {
        store.transaction(()-> {
            for(String kind:KINDS) {
                Set<String> ids=new HashSet<>();
                for(JSONObject row:store.all(kind)) ids.add(row.optString("id"));
                for(JSONObject row:store.states(kind)) ids.add(row.optString("id"));
                for(String id:ids) {
                    JSONObject local=store.get(kind,id), state=store.state(kind,id);
                    if(state==null) state=Json.obj("id",id,"version",0,"snapshot",null);
                    if(!state.has("operation") && !Json.same(local,state.optJSONObject("snapshot"))) {
                        Json.put(state,"operation",UUID.randomUUID().toString());Json.put(state,"pending",local);store.putState(kind,id,state);
                    }
                }
            }
        });
    }
    int pending() { scan();int n=0;for(String kind:KINDS) for(JSONObject s:store.states(kind)) if(s.has("operation")) n++;return n; }
    void run() throws Exception {
        JSONObject capability=(JSONObject)cloud.rpc("planner_sync_capabilities",Json.obj());
        if(capability.optInt("planner")!=1) throw new IllegalStateException("日历云同步尚未上线");
        scan();
        for(String kind:KINDS) for(JSONObject state:store.states(kind)) {
            if(!state.has("operation")) continue;
            String id=state.optString("id"), op=state.optString("operation");
            JSONObject result=(JSONObject)cloud.rpc("apply_planner_mutation",Json.obj("p_operation_id",op,"p_workspace_id",store.workspace,"p_kind",kind,"p_id",id,"p_base_version",state.optInt("version"),"p_payload",state.optJSONObject("pending")));
            JSONObject remote=result.optJSONObject("record");
            boolean conflict=result.optString("status").equals("conflict");
            if((!conflict && !result.optString("status").equals("applied")) || remote==null || !remote.optString("workspace_id").equals(store.workspace) || !remote.optString("id").equals(id) || !remote.optString("kind").equals(kind) || remote.optInt("version")<1) throw new IllegalStateException("服务器未确认保存，稍后重试");
            store.transaction(()-> {
                JSONObject current=store.state(kind,id);
                if(current==null || !current.optString("operation").equals(op)) return;
                JSONObject payload=remote.optJSONObject("payload");
                if(conflict) {
                    JSONObject local=store.get(kind,id);
                    if(!Json.same(local,payload)) {
                        store.conflict(op,Json.obj("id",op,"kind",kind,"recordId",id,"local",local,"remote",payload,"createdAt",Instant.now().toString()));
                        if(kind.equals("event") && local!=null && Json.str(local,"deletedAt").isEmpty()) {
                            JSONObject copy=Json.copy(local);Json.put(copy,"id",UUID.randomUUID().toString());
                            String title=copy.optString("title");Json.put(copy,"title",title.substring(0,Math.min(title.length(),225))+"（冲突副本）");copy.remove("importKey");store.put(kind,copy);
                        }
                    }
                    if(payload==null) store.remove(kind,id);else store.put(kind,payload);
                }
                store.putState(kind,id,Json.obj("id",id,"version",remote.optInt("version"),"snapshot",conflict?payload:state.optJSONObject("pending")));
            });
        }
        for(String kind:KINDS) {
            String after="";
            while(true) {
                JSONArray rows=(JSONArray)cloud.get("planner_records?select=workspace_id,kind,id,version,payload&workspace_id=eq."+store.workspace+"&kind=eq."+kind+"&id=gt."+URLEncoder.encode(after,"UTF-8")+"&order=id&limit=500");
                if(rows.length()==0) break;
                for(int i=0;i<rows.length();i++) {
                    JSONObject row=rows.getJSONObject(i);String id=row.getString("id");
                    store.transaction(()-> {
                        JSONObject state=store.state(kind,id),local=store.get(kind,id);
                        if(state!=null && state.has("operation")) return;
                        if(!Json.same(local,state==null?null:state.optJSONObject("snapshot"))) return;
                        if(state!=null && state.optInt("version")>=row.optInt("version")) return;
                        JSONObject payload=row.optJSONObject("payload");
                        if(payload==null) store.remove(kind,id);else store.put(kind,payload);
                        store.putState(kind,id,Json.obj("id",id,"version",row.optInt("version"),"snapshot",payload));
                    });
                }
                after=rows.getJSONObject(rows.length()-1).getString("id");
            }
        }
        // Existing dated todos use their established contract. Display bodies and
        // planning unchanged; calendar links supply label/time metadata.
        String after="00000000-0000-0000-0000-000000000000";
        while(true) {
            JSONArray rows=(JSONArray)cloud.get("todos?workspace_id=eq."+store.workspace+"&id=gt."+after+"&order=id&limit=500");
            if(rows.length()==0) break;
            for(int i=0;i<rows.length();i++) store.put("todo",rows.getJSONObject(i));
            after=rows.getJSONObject(rows.length()-1).getString("id");
        }
        scan();
    }
}
