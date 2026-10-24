-- Keep every existing colour; accept the two additional pastel palettes.
begin;

alter table public.notes drop constraint notes_color_check;
alter table public.notes
  add constraint notes_color_check check (color in (
    'amber', 'rose', 'sage', 'sky', 'violet', 'graphite',
    'lavender', 'mauve', 'mist', 'dustyrose', 'peach', 'clay'
  ));

commit;
