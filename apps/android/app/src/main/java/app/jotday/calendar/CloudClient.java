package app.jotday.calendar;

import android.content.Context;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

final class CloudClient {
    private final SessionVault vault;
    private JSONObject session;
    CloudClient(Context context) { vault=new SessionVault(context); }
    private Object request(String path,JSONObject body,String token) throws Exception {
        if(!BuildConfig.CLOUD_URL.startsWith("https://") || BuildConfig.PUBLIC_KEY.isEmpty()) throw new IOException("此安装包未配置同步服务");
        HttpURLConnection c=(HttpURLConnection)new URL(BuildConfig.CLOUD_URL+path).openConnection();
        c.setConnectTimeout(15000);c.setReadTimeout(20000);
        c.setRequestProperty("apikey",BuildConfig.PUBLIC_KEY);
        c.setRequestProperty("Content-Type","application/json");
        if(token!=null) c.setRequestProperty("Authorization","Bearer "+token);
        try {
            if(body!=null) { c.setRequestMethod("POST");c.setDoOutput(true);try(OutputStream out=c.getOutputStream()) { out.write(body.toString().getBytes(StandardCharsets.UTF_8)); } }
            int code=c.getResponseCode();
            InputStream input=code<400?c.getInputStream():c.getErrorStream();
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            if(input!=null){byte[] buffer=new byte[8192];int n;while((n=input.read(buffer))!=-1)bytes.write(buffer,0,n);}
            String raw=bytes.toString("UTF-8");
            if(input!=null) input.close();
            if(code>=400) {
                String message="同步暂未完成（"+code+"），本机内容已保留";
                if(code==401 || code==403) message="设备连接已失效，请重新配对；本机内容已保留";
                if(raw.contains("invalid_or_expired") || raw.contains("invalid_code")) message="配对码无效或已过期";
                if(raw.contains("PGRST202") || raw.contains("PGRST205")) message="日历云同步尚未上线，本机内容已保留";
                throw new IOException(message);
            }
            return new JSONTokener(raw).nextValue();
        } finally { c.disconnect(); }
    }
    synchronized String token() throws Exception {
        if(session==null) session=vault.load();
        if(session==null) {
            session=(JSONObject)request("/auth/v1/signup",Json.obj("data",Json.obj()),null);
            remember();
        } else if(session.optLong("expires_at",0)<System.currentTimeMillis()/1000+90) {
            session=(JSONObject)request("/auth/v1/token?grant_type=refresh_token",Json.obj("refresh_token",session.optString("refresh_token")),null);
            remember();
        }
        if(session.optString("access_token").isEmpty()) throw new IOException("无法建立设备连接");
        return session.optString("access_token");
    }
    private void remember() throws Exception {
        if(!session.has("expires_at")) Json.put(session,"expires_at",System.currentTimeMillis()/1000+session.optLong("expires_in",3600));
        vault.save(session);
    }
    Object rpc(String name,JSONObject args) throws Exception { return request("/rest/v1/rpc/"+name,args,token()); }
    Object get(String query) throws Exception { return request("/rest/v1/"+query,null,token()); }
    JSONObject function(String name,JSONObject body) throws Exception { return (JSONObject)request("/functions/v1/"+name,body,token()); }
    String redeem(String code) throws Exception {
        if(!code.matches("[0-9]{6}")) throw new IOException("请输入 6 位配对码");
        String id=function("redeem-pairing",Json.obj("code",code)).optString("workspaceId");
        java.util.UUID.fromString(id);return id;
    }
}
