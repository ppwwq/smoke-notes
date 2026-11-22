package app.jotday.calendar;

import org.json.*;
import java.time.Instant;
import java.util.*;

/** Durable, immutable retry envelopes. Network work never holds a SQLite transaction. */
final class WorkspaceSync {
    interface Transport { JSONObject mutate(JSONObject operation)throws Exception; JSONArray pull(String kind,String after)throws Exception; void capabilities()throws Exception; }
    private final PlannerStore store;private final Transport transport;
    WorkspaceSync(PlannerStore s,CloudClient cloud){this(s,new Transport(){
        public void capabilities()throws Exception{JSONObject c=cloud.function("apply-mutation",Json.obj("capabilities",true));if(c.optJSONObject("capabilities")==null||c.optJSONObject("capabilities").optInt("todoPlanning")!=1)throw new IllegalStateException("服务端暂不支持待办计划，本机内容已保留");}
        public JSONObject mutate(JSONObject op)throws Exception{return cloud.function("apply-mutation",Json.obj("operation",op));}
        public JSONArray pull(String kind,String after)throws Exception{return (JSONArray)cloud.get(kind+"s?"+(kind.equals("note")?"select=*,notebooks!inner(workspace_id)&notebooks.workspace_id=eq.":"select=*&workspace_id=eq.")+s.workspace+"&id=gt."+after+"&order=id&limit=500");}
    });}
    WorkspaceSync(PlannerStore s,Transport t){store=s;transport=t;}
    private String key(String kind){return "workspace:"+kind;}
    void scan(){store.transaction(()->{for(String kind:WorkspaceRecords.KINDS)for(JSONObject row:store.all(kind)){
        String id=row.optString("id");JSONObject state=store.state(key(kind),id);
        // Upgrade the old calendar-only read cache; these rows have never been editable.
        if(state==null)state=Json.obj("id",id,"version",row.optInt("version"),"snapshot",row.optInt("version")>0?row:null);
        if(!state.has("operation")&&!WorkspaceRecords.same(kind,row,state.optJSONObject("snapshot"))){
            JSONObject op=Json.obj("id",UUID.randomUUID().toString(),"entity",kind,"entityId",id,"baseVersion",state.optInt("version"),"action",WorkspaceRecords.alive(row)?"upsert":"delete","payload",WorkspaceRecords.payload(kind,row));
            Json.put(state,"operation",op);Json.put(state,"pending",row);
        }store.putState(key(kind),id,state);
    }});}
    int pending(){scan();int n=0;for(String kind:WorkspaceRecords.KINDS)for(JSONObject s:store.states(key(kind)))if(s.has("operation"))n++;return n;}
    void run()throws Exception{
        transport.capabilities();WorkspaceRecords.reconcile(store);scan();
        for(String kind:WorkspaceRecords.KINDS)for(JSONObject state:store.states(key(kind))){
            JSONObject op=state.optJSONObject("operation");if(op==null)continue;
            JSONObject response=transport.mutate(Json.copy(op));accept(kind,state,response);
        }
        for(String kind:WorkspaceRecords.KINDS){String after="00000000-0000-0000-0000-000000000000";
            while(true){JSONArray rows=transport.pull(kind,after);if(rows.length()==0)break;
                for(int i=0;i<rows.length();i++){JSONObject remote=rows.getJSONObject(i);remote.remove("notebooks");String id=remote.getString("id");
                    store.transaction(()->{JSONObject state=store.state(key(kind),id),local=store.get(kind,id);
                        if(state!=null&&state.has("operation"))return;
                        if(!WorkspaceRecords.same(kind,local,state==null?null:state.optJSONObject("snapshot")))return;
                        if(state!=null&&state.optInt("version")>=remote.optInt("version"))return;
                        if (!WorkspaceRecords.purged(local) || WorkspaceRecords.purged(remote)) store.put(kind,remote);
                        store.putState(key(kind),id,Json.obj("id",id,"version",remote.optInt("version"),"snapshot",remote));
                    });
                }String next=rows.getJSONObject(rows.length()-1).getString("id");if(next.compareTo(after)<=0)throw new IllegalStateException("同步分页未前进");after=next;
            }
        }WorkspaceRecords.reconcile(store);scan();
    }
    private void accept(String kind,JSONObject state,JSONObject response){
        JSONObject op=state.optJSONObject("operation"),remote=response.optJSONObject("record");boolean conflict=response.optString("status").equals("conflict");String id=op.optString("entityId");
        if((!conflict&&!response.optString("status").equals("applied"))||remote==null||!id.equals(remote.optString("id"))||remote.optInt("version")<1||kind.equals("todo")&&response.optInt("todoPlanningVersion")!=1)throw new IllegalStateException("服务器未确认完整保存，本机修改将重试");
        if(!kind.equals("note")&&!store.workspace.equals(remote.optString("workspace_id")))throw new IllegalStateException("服务器工作区不匹配");
        store.transaction(()->{
            JSONObject currentState=store.state(key(kind),id);if(currentState==null||!Json.same(currentState.optJSONObject("operation"),op))return;
            JSONObject local=store.get(kind,id);
            if (WorkspaceRecords.purged(remote)) store.put(kind,remote);
            else if (WorkspaceRecords.purged(local)) {
                // Keep the local tombstone; scan retries it at the acknowledged remote version.
            } else if(conflict&&!WorkspaceRecords.same(kind,local,remote)){
                store.conflict(op.optString("id"),Json.obj("id",op.optString("id"),"kind",kind,"recordId",id,"local",local,"remote",remote,"createdAt",Instant.now().toString()));
                if(kind.equals("note")&&WorkspaceRecords.alive(local)){JSONObject copy=Json.copy(local);Json.put(copy,"id",UUID.randomUUID().toString());Json.put(copy,"version",0);Json.put(copy,"conflict_of",id);String title=copy.optString("title");Json.put(copy,"title",title.substring(0,Math.min(185,title.length()))+"（冲突副本）");store.put(kind,copy);}
                store.put(kind,remote);
            }else if(WorkspaceRecords.same(kind,local,state.optJSONObject("pending")))store.put(kind,remote);
            store.putState(key(kind),id,Json.obj("id",id,"version",remote.optInt("version"),"snapshot",remote));
        });
    }
}
