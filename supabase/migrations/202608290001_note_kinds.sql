alter table public.notes
  add column kind text not null default 'note',
  add constraint notes_kind_check check (kind in ('note', 'todo'));
