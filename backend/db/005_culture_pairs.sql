begin;

alter table campaigns drop constraint if exists campaigns_mode_check;
alter table campaigns add constraint campaigns_mode_check check (mode in ('token_first', 'nft_first', 'twin_launch', 'event_first'));

commit;
