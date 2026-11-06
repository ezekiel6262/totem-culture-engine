begin;
create table coordination_votes (
  space text not null check (space in ('arena','traits','council')),
  subject_id text not null,
  account_id text not null,
  choice text not null,
  weight smallint not null check (weight between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (space,subject_id,account_id,choice)
);
create index coordination_votes_tally_idx on coordination_votes(space,subject_id,choice);
commit;
