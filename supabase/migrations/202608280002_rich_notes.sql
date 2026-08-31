alter table public.notes
  add column content_json jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  add column color text not null default 'amber';

update public.notes n
set content_json = jsonb_build_object(
  'type', 'doc',
  'content', coalesce((
    select jsonb_agg(
      case
        when line = '' then jsonb_build_object('type', 'paragraph')
        else jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', line))
        )
      end order by ordinal
    )
    from unnest(string_to_array(n.body, E'\n')) with ordinality as lines(line, ordinal)
  ), jsonb_build_array(jsonb_build_object('type', 'paragraph')))
);

alter table public.notes
  add constraint notes_color_check check (color in ('amber', 'rose', 'sage', 'sky', 'violet', 'graphite')),
  add constraint notes_content_json_shape_check check (
    jsonb_typeof(content_json) = 'object'
    and content_json ->> 'type' = 'doc'
    and jsonb_typeof(content_json -> 'content') = 'array'
    and octet_length(content_json::text) <= 500000
  );
