# �̼㲿��˵��

����������Ŀ�� GitHub Actions ����ƾ�ݷ�Χ��Ǩ����ʷ�˶Բ����
[�ƶ˲���˵��](docs/CLOUD_DEPLOYMENT.md)������������ȱ��Ǩ����ʷ����������ɸú˶ԣ�����ֱ�������·�������Ŀ `db push` ���衣

## 1. ���� Supabase ��Ŀ

1. �� Supabase ������Ŀ����¼ Project URL��Publishable Key �� Project Ref��
2. �� Authentication ����������������¼���ֻ������������ݺ���Ϊ���豸����Ҫ������ԡ�
3. ��װ����¼ Supabase CLI��Ȼ������Ŀ��Ŀ¼ִ�У�

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase functions deploy create-pairing
supabase functions deploy redeem-pairing
supabase functions deploy apply-mutation
```

Ǩ�ƻᴴ��˽�˿ռ䡢�豸��Ա����ǩ������ǩ�����졢һ��������뼰 RLS ���ԣ���Ϊ��ǩ���븻�ı� JSON����ɫ����ͨ/���������ֶΡ��ɼ�¼�ᱣ�����ݲ�Ĭ��Ϊ��ͨ��ǩ��

## 2. ���ù�������

����Ӧ�þ���ȡ�ֿ��Ŀ¼�� `.env`����Ҫֻ�� `apps/web` �� `apps/desktop` ����д���á��й�ƽ̨�ṩ��ͬ�����������������ļ���

�ڱ��� `.env` �Լ� Cloudflare Pages �� Production/Preview ���������ã�

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_WEB_APP_URL=https://YOUR_PROJECT.pages.dev
```

��Ҫ�� Service Role Key �Ž� `.env` ��ǰ�ˡ�Supabase �йܱ�Ե�������ṩ����������ķ���˻���������

���ɶ�ά��ķ���������Ҫ����������ʽ��ҳ��ַ��`VITE_WEB_APP_URL` �����Զ�������Ե��������

```powershell
supabase secrets set WEB_APP_URL=https://YOUR_PROJECT.pages.dev
```

��ʾ����ַ�滻Ϊʵ�� HTTPS ��ַ����ҳ�����ı�ʱҲҪ���´�ֵ�������ά���Ի�ָ��ɵ�ַ���ο� [Supabase ���������ĵ�](https://supabase.com/docs/guides/functions/secrets)��

## 3. �����ֻ� PWA �� Cloudflare Pages

���������͵� Git �ֿ⣬���� Cloudflare Pages ѡ��òֿ⣺

- Framework preset��None��
- Build command��`pnpm install --frozen-lockfile && pnpm --filter @smoke-notes/web build`��
- Build output directory��`apps/web/dist`��
- Node.js��22 ����°汾��
- ������һ�ڵ���������������

�������ʵ�� Pages ����д�� `VITE_WEB_APP_URL`�����¹�������ˡ��������ɵĶ�ά��Ż�ָ����ȷ���ֻ���ַ��

## 4. ���� Windows ��װ��

����������ͬ���������� Windows x64 ����ִ�У�

```powershell
pnpm --filter @smoke-notes/desktop package
```

����ļ�Ϊ `apps/desktop/release/SmokeNotes-Setup-<�汾��>.exe`���汾������Ӧ�õ� package.json ��������ǰ����û����ҵ����ǩ������ʽ�ַ�ǰӦ���� Windows ����ǩ��֤�顣

## 5. ��������

1. ���Դ���������ǩ���Ͷ��Ų�ͬ��ɫ��ǩ���϶����򲢴򿪶������ڡ�
2. �ֻ�ɨ���ά���������λ�룬ȷ�ϱ��⡢��ʽ����ɫ��˳��ʹ���˫��ͬ����
3. �ֻ������༭��ָ����磬ȷ�������ϴ���û�ж�ʧ��
4. �ò����ڸÿռ�� Supabase �û�ȷ���޷���ȡ��ǩ���ݡ�
5. �� Windows ��������ȷ���ϴδ򿪵ı�ǩλ�á���С��͸���Ⱥ��ö�״̬�ָ���
