-- EP02 — tabelas de referência para os selects de perfil.
--
-- Campus e curso viram tabela (e não CHECK/enum) porque mudam por decisão da
-- universidade, não do código: abrir um campus novo ou um curso novo não deve
-- exigir migration nem release do app.

create table if not exists public.campuses (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  city       text        not null,
  -- Preenchidos depois via a Edge Function `geocode`. Servem para sugerir o
  -- campus do perfil como destino da rota (wireframe 3.1).
  latitude   double precision,
  longitude  double precision,
  is_active  boolean     not null default true,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now()
);

comment on table public.campuses is
  'Campi da universidade. Coordenadas ficam nulas até serem geocodificadas.';

create table if not exists public.courses (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null unique,
  is_active  boolean     not null default true,
  created_at timestamptz not null default now()
);

comment on table public.courses is
  'Cursos de graduação. ATENÇÃO: a carga inicial é um ponto de partida montado '
  'pela equipe de desenvolvimento, não o catálogo oficial da universidade. '
  'Revisar com a coordenação antes de usar com a turma.';

insert into public.campuses (name, city, sort_order) values
  ('Perdizes (Monte Alegre)', 'São Paulo', 1),
  ('Consolação (Marquês de Paranaguá)', 'São Paulo', 2),
  ('Santana', 'São Paulo', 3),
  ('Ipiranga', 'São Paulo', 4),
  ('Barueri', 'Barueri', 5),
  ('Sorocaba', 'Sorocaba', 6)
on conflict (name) do nothing;

insert into public.courses (name) values
  ('Administração'),
  ('Ciência da Computação'),
  ('Ciências Biológicas'),
  ('Ciências Contábeis'),
  ('Ciências Econômicas'),
  ('Ciências Sociais'),
  ('Comunicação e Multimeios'),
  ('Direito'),
  ('Enfermagem'),
  ('Engenharia Biomédica'),
  ('Engenharia de Produção'),
  ('Filosofia'),
  ('Física'),
  ('Fisioterapia'),
  ('Fonoaudiologia'),
  ('Geografia'),
  ('História'),
  ('Jornalismo'),
  ('Letras'),
  ('Matemática'),
  ('Medicina'),
  ('Pedagogia'),
  ('Psicologia'),
  ('Publicidade e Propaganda'),
  ('Relações Internacionais'),
  ('Secretariado Executivo Trilíngue'),
  ('Serviço Social'),
  ('Sistemas de Informação'),
  ('Teologia'),
  ('Tecnologia e Mídias Digitais')
on conflict (name) do nothing;

alter table public.campuses enable row level security;
alter table public.courses  enable row level security;

-- Dados públicos e não sensíveis: o app precisa deles para montar os selects,
-- inclusive antes de o perfil estar completo.
drop policy if exists "campuses_select_active" on public.campuses;
create policy "campuses_select_active"
  on public.campuses for select
  to anon, authenticated
  using (is_active);

drop policy if exists "courses_select_active" on public.courses;
create policy "courses_select_active"
  on public.courses for select
  to anon, authenticated
  using (is_active);

-- Sem policies de escrita: só service_role (dashboard ou migration).
