package app.jotday.calendar;

import org.json.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

final class CalendarProjector {
    static final ZoneId ZONE=ZoneId.of("Asia/Hong_Kong");
    static final class Occurrence {
        JSONObject event, source;
        String occurrenceDate;
        LocalDateTime start,end;
        boolean reminder;
        String title() { return source.optString("title"); }
        boolean allDay() { return source.optBoolean("allDay"); }
        boolean recurring() { return event.optJSONObject("repeat")!=null; }
    }
    static List<Occurrence> project(List<JSONObject> records,LocalDate from,LocalDate to) {
        List<Occurrence> output=new ArrayList<>();
        for(JSONObject e:records) {
            if(!Json.str(e,"deletedAt").isEmpty()) continue;
            try {
                LocalDateTime start=LocalDateTime.parse(e.getString("start")),end=LocalDateTime.parse(e.getString("end"));
                Duration length=Duration.between(start,end);
                JSONObject repeat=e.optJSONObject("repeat"), exceptions=e.optJSONObject("exceptions");
                if(exceptions==null) exceptions=new JSONObject();
                if(repeat==null) add(output,e,e,start.toLocalDate().toString(),from,to);
                else {
                    LocalDate first=start.toLocalDate();
                    LocalDate lower=from.minusDays(length.toDays()+3),upper=to.plusDays(2);
                    LocalDate stop=Json.str(repeat,"until").isEmpty()?upper:LocalDate.parse(repeat.getString("until"));
                    if(stop.isAfter(upper)) stop=upper;
                    int count=0,limit=repeat.optInt("count",Integer.MAX_VALUE);
                    // Count from DTSTART to preserve count semantics for a later viewing month.
                    for(LocalDate day=!repeat.has("count")&&lower.isAfter(first)?lower:first;!day.isAfter(stop);day=day.plusDays(1)) {
                        if(!matches(first,day,repeat)) continue;
                        if(++count>limit) break;
                        if(day.isBefore(lower) || exceptions.has(day.toString())) continue;
                        JSONObject value=Json.copy(e);LocalDateTime s=day.atTime(start.toLocalTime());
                        Json.put(value,"start",stamp(s));Json.put(value,"end",stamp(s.plus(length)));
                        add(output,e,value,day.toString(),from,to);
                    }
                    Iterator<String> keys=exceptions.keys();while(keys.hasNext()) {
                        String date=keys.next();JSONObject value=exceptions.optJSONObject(date);
                        if(value!=null) add(output,e,value,date,from,to);
                    }
                }
            } catch(Exception ignored) { /* Invalid remote records do not crash or mutate the local cache. */ }
        }
        output.sort(Comparator.comparing((Occurrence o)->o.start).thenComparing(Occurrence::title));return output;
    }
    static String stamp(LocalDateTime time) { return time.toString().substring(0,16); }
    static boolean matches(LocalDate first,LocalDate date,JSONObject r) {
        int interval=Math.max(1,r.optInt("interval",1));String frequency=r.optString("frequency");
        if(date.isBefore(first)) return false;
        if(frequency.equals("daily")) return ChronoUnit.DAYS.between(first,date)%interval==0;
        if(frequency.equals("weekly")) {
            LocalDate firstMonday=first.minusDays(first.getDayOfWeek().getValue()-1);
            LocalDate monday=date.minusDays(date.getDayOfWeek().getValue()-1);
            return ChronoUnit.WEEKS.between(firstMonday,monday)%interval==0 && contains(r.optJSONArray("weekdays"),date.getDayOfWeek().getValue()%7);
        }
        if(frequency.equals("monthly") && ChronoUnit.MONTHS.between(YearMonth.from(first),YearMonth.from(date))%interval!=0) return false;
        if(frequency.equals("yearly")) {
            if((date.getYear()-first.getYear())%interval!=0) return false;
            JSONArray months=r.optJSONArray("months");
            if(months!=null?!contains(months,date.getMonthValue()):date.getMonthValue()!=first.getMonthValue()) return false;
        }
        JSONObject nth=r.optJSONObject("nthWeekday");
        if(nth!=null) {
            if(date.getDayOfWeek().getValue()%7!=nth.optInt("weekday")) return false;
            int ordinal=nth.optInt("ordinal");
            return ordinal==-1?date.plusWeeks(1).getMonth()!=date.getMonth():(date.getDayOfMonth()-1)/7+1==ordinal;
        }
        JSONArray days=r.optJSONArray("monthDays");
        return days!=null?contains(days,date.getDayOfMonth()):date.getDayOfMonth()==first.getDayOfMonth();
    }
    static boolean contains(JSONArray values,int n) { if(values==null)return false;for(int i=0;i<values.length();i++)if(values.optInt(i,-100)==n)return true;return false; }
    private static void add(List<Occurrence> out,JSONObject event,JSONObject value,String date,LocalDate from,LocalDate to) {
        LocalDateTime start=LocalDateTime.parse(value.optString("start")),end=LocalDateTime.parse(value.optString("end"));
        if(!value.optBoolean("allDay")) {
            ZoneId zone=ZoneId.of(value.optString("timeZone","Asia/Hong_Kong"));
            if(zone.getRules().getValidOffsets(start).isEmpty() || zone.getRules().getValidOffsets(end).isEmpty()) return;
            start=start.atZone(zone).withZoneSameInstant(ZONE).toLocalDateTime();end=end.atZone(zone).withZoneSameInstant(ZONE).toLocalDateTime();
        }
        if(start.isBefore(to.plusDays(1).atStartOfDay()) && end.isAfter(from.atStartOfDay())) {
            Occurrence o=new Occurrence();o.event=event;o.source=value;o.occurrenceDate=date;o.start=start;o.end=end;out.add(o);
        }
    }
    static String todoId(String series,String day) {
        try {
            java.security.MessageDigest sha=java.security.MessageDigest.getInstance("SHA-1");
            java.nio.ByteBuffer namespace=java.nio.ByteBuffer.allocate(16);
            UUID dns=UUID.fromString("6ba7b810-9dad-11d1-80b4-00c04fd430c8");namespace.putLong(dns.getMostSignificantBits()).putLong(dns.getLeastSignificantBits());
            sha.update(namespace.array());byte[] bytes=sha.digest(("smoke-notes:todo-occurrence:"+series+":"+day).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            bytes[6]=(byte)((bytes[6]&15)|0x50);bytes[8]=(byte)((bytes[8]&63)|0x80);
            java.nio.ByteBuffer b=java.nio.ByteBuffer.wrap(bytes);return new UUID(b.getLong(),b.getLong()).toString();
        }catch(Exception e){throw new IllegalStateException(e);}
    }
    static List<JSONObject> projectTodos(List<JSONObject> records,LocalDate from,LocalDate to,LocalDate today) {
        Map<String,JSONObject> existing=new HashMap<>(),result=new LinkedHashMap<>();
        for(JSONObject todo:records) {
            existing.put(todo.optString("id"),todo);JSONObject p=todo.optJSONObject("planning");
            if(!Json.str(todo,"deleted_at").isEmpty() || p!=null&&(p.optString("kind").equals("series")||p.optString("kind").equals("settings")||p.optBoolean("ruleSkipped")))continue;
            try {
                LocalDate date=p!=null&&p.has("date")?LocalDate.parse(p.getString("date")):Instant.parse(todo.getString("updated_at")).atZone(ZONE).toLocalDate();
                if(date.isBefore(from)||date.isAfter(to)||date.isAfter(today)&&p!=null&&p.optString("kind").equals("occurrence")&&p.optBoolean("generated"))continue;
                JSONObject value=Json.copy(todo);if(p==null)Json.put(value,"planning",Json.obj("date",date.toString()));result.put(todo.optString("id"),value);
            }catch(Exception ignored){}
        }
        for(JSONObject series:records) {
            JSONObject p=series.optJSONObject("planning");if(p==null||!p.optString("kind").equals("series")||!Json.str(series,"deleted_at").isEmpty())continue;
            JSONArray revisions=p.optJSONArray("revisions");if(revisions==null)continue;
            for(LocalDate day=from;!day.isAfter(to);day=day.plusDays(1)) {
                String date=day.toString();JSONObject rule=null;String best="";
                for(int i=0;i<revisions.length();i++){JSONObject r=revisions.optJSONObject(i);if(r==null||r.optString("effectiveFrom").compareTo(date)>0)continue;String key=r.optString("effectiveFrom")+"|"+r.optString("changedAt")+"|"+r.optString("id");if(key.compareTo(best)>0){best=key;rule=r;}}
                if(rule==null||rule.optBoolean("paused")||rule.optBoolean("stopped"))continue;
                JSONObject repeat=rule.optJSONObject("repeat");if(repeat==null)continue;String kind=repeat.optString("kind");int weekday=day.getDayOfWeek().getValue()%7;
                if(!kind.equals("daily")&&!(kind.equals("weekdays")?weekday>=1&&weekday<=5:contains(repeat.optJSONArray("weekdays"),weekday)))continue;
                String id=todoId(series.optString("id"),date);JSONObject prior=existing.get(id);
                if(prior!=null&&(!day.isAfter(today)||!Json.str(prior,"deleted_at").isEmpty()||prior.optJSONObject("planning")==null||!prior.optJSONObject("planning").optBoolean("generated")))continue;
                result.put(id,Json.obj("id",id,"text",rule.optString("text"),"completed",false,"planning",Json.obj("kind","occurrence","date",date,"seriesId",series.optString("id"),"notes",rule.optString("notes"),"status","open","generated",true)));
            }
        }
        return new ArrayList<>(result.values());
    }
    static List<Occurrence> reminders(PlannerStore store,LocalDate from,LocalDate to) {
        List<Occurrence> out=new ArrayList<>();LocalDate today=LocalDate.now(ZONE);
        for(JSONObject todo:store.all("todo")){JSONObject p=todo.optJSONObject("planning");if(p!=null&&p.optString("kind").equals("settings")){JSONObject settings=p.optJSONObject("settings");if(settings!=null)today=ZonedDateTime.now(ZONE).minusHours(settings.optInt("dayBoundaryHour")).toLocalDate();}}
        for(JSONObject todo:projectTodos(store.all("todo"),from,to,today)) {
            JSONObject p=todo.optJSONObject("planning");if(p==null||p.optString("status").equals("skipped"))continue;
            try {
                LocalDate day=LocalDate.parse(p.getString("date"));
                JSONObject link=store.get("link",store.workspace+":"+todo.optString("id"));
                if(link==null && p.has("seriesId")) link=store.get("link",store.workspace+":"+p.optString("seriesId"));
                String time=Json.str(link,"time");
                Occurrence o=new Occurrence();o.event=todo;o.reminder=true;o.occurrenceDate=day.toString();
                o.start=day.atTime(time.isEmpty()?LocalTime.MIDNIGHT:LocalTime.parse(time));o.end=o.start.plusMinutes(1);
                JSONObject type=link==null?null:store.get("type",link.optString("typeId"));
                o.source=Json.obj("title",todo.optString("text"),"allDay",time.isEmpty(),"color",type==null?"sage":type.optString("color"),"notes",p.optString("notes"),"typeId",link==null?null:link.opt("typeId"));out.add(o);
            } catch(Exception ignored) {}
        }
        return out;
    }
}
