package app.jotday.calendar;

import org.json.*;
import java.util.*;

final class Json {
    static JSONObject object(String raw) {
        try { return new JSONObject(raw); } catch (JSONException e) { throw new IllegalArgumentException(e); }
    }
    static JSONObject copy(JSONObject source) { return object(source.toString()); }
    static JSONObject obj(Object... pairs) {
        JSONObject value = new JSONObject();
        for(int i=0;i<pairs.length;i+=2) put(value, (String)pairs[i], pairs[i+1]);
        return value;
    }
    static void put(JSONObject value, String key, Object item) {
        try { value.put(key, item == null ? JSONObject.NULL : item); } catch(JSONException e) { throw new IllegalArgumentException(e); }
    }
    static String str(JSONObject v, String key) { return v == null || v.isNull(key) ? "" : v.optString(key, ""); }
    static String canonical(Object value) {
        if(value == null || value == JSONObject.NULL) return "null";
        if(value instanceof JSONObject) {
            JSONObject o = (JSONObject)value;
            List<String> keys=new ArrayList<>(); o.keys().forEachRemaining(keys::add); Collections.sort(keys);
            StringJoiner result=new StringJoiner(",","{","}");
            for(String key:keys) if(!key.equals("updatedAt")) result.add(JSONObject.quote(key)+":"+canonical(o.opt(key)));
            return result.toString();
        }
        if(value instanceof JSONArray) {
            JSONArray a=(JSONArray)value; StringJoiner result=new StringJoiner(",","[","]");
            for(int i=0;i<a.length();i++) result.add(canonical(a.opt(i))); return result.toString();
        }
        return value instanceof String ? JSONObject.quote((String)value) : value.toString();
    }
    static boolean same(JSONObject a, JSONObject b) { return canonical(a).equals(canonical(b)); }
}
