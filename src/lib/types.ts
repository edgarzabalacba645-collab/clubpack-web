// Tipos que reflejan sql/schema.sql + sql/002_mejoras.sql del proyecto original.
// Si el schema cambia en Supabase, actualizar acá a mano (no se generó con la CLI).

export type Rol = "miembro" | "admin";
export type EstadoSuscripcion = "activo" | "vencido" | "cancelado" | "pendiente";
export type EstadoTrack = "activo" | "duplicado_sospechoso" | "eliminado";
export type TipoDuplicado = "fingerprint_exacto" | "texto_similar";
export type EstadoDuplicado = "pendiente" | "descartado" | "resuelto";

export interface Perfil {
  id: string;
  nombre_dj: string | null;
  email: string | null;
  rol: Rol;
  estado_suscripcion: EstadoSuscripcion;
  mp_subscription_id: string | null;
  fecha_alta: string;
}

export interface Genero {
  id: string;
  nombre: string;
  activo: boolean;
  orden: number;
}

export interface Track {
  id: string;
  titulo: string;
  artista_original: string | null;
  remixer: string | null;
  genero: string | null;
  genero_id: string | null;
  bpm: number | null;
  key_armonica: string | null;
  tags: string[];
  storage_path: string;
  duracion_seg: number | null;
  tamano_mb: number | null;
  subido_por: string | null;
  fecha_subida: string;
  audio_fingerprint: string | null;
  estado: EstadoTrack;
  portada_url: string | null;
}

export interface MensajeChat {
  id: string;
  usuario_id: string;
  mensaje: string;
  fecha: string;
  // Solo viene cuando se pide con el join a perfiles (ver ChatPage).
  perfiles?: { nombre_dj: string | null; email: string | null } | null;
}

export interface HerramientaDJ {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagen_path: string | null;
  link_descarga: string;
  creado_por: string | null;
  orden: number;
  fecha_creacion: string;
}

export interface Descarga {
  id: string;
  usuario_id: string;
  track_id: string;
  fecha: string;
}

export type TipoPago = "mercadopago" | "manual";

export interface Pago {
  id: string;
  usuario_id: string | null;
  mp_payment_id: string | null;
  estado: string | null;
  monto: number | null;
  moneda: string;
  payload_crudo: Record<string, unknown> | null;
  fecha: string;
  tipo: TipoPago;
  confirmado_por: string | null;
  comentario: string | null;
}

// Fila única (singleton, id siempre `true`) con precio y datos de cobro.
export interface ConfiguracionSuscripcion {
  id: true;
  precio_mensual: number;
  moneda: string;
  cbu_cvu: string | null;
  alias_cbu: string | null;
  titular_cuenta: string | null;
  mp_habilitado: boolean;
  actualizado_por: string | null;
  actualizado_en: string;
}

// Fila única (singleton, id siempre `true`) con configuración general
// del catálogo — ver sql/010_control_subidas.sql.
export interface ConfiguracionCatalogo {
  id: true;
  permite_subida_colaboradores: boolean;
  actualizado_por: string | null;
  actualizado_en: string;
}

export interface DuplicadoDetectado {
  id: string;
  track_id_a: string;
  track_id_b: string;
  tipo: TipoDuplicado;
  similitud: number | null;
  estado: EstadoDuplicado;
  fecha_deteccion: string;
}

export interface Playlist {
  id: string;
  nombre: string;
  descripcion: string | null;
  creado_por: string | null;
  fecha_creacion: string;
}

export interface PlaylistTrack {
  playlist_id: string;
  track_id: string;
  orden: number;
}

// Nota: NO hay un tipo `Database` acá para pasarle a `createClient<Database>`.
// @supabase/supabase-js@2.119 (postgrest-js nuevo) solo infiere bien los
// tipos de un Database generado por la CLI de Supabase — uno escrito a mano,
// aunque respete el shape {Row, Insert, Update, Relationships} que pide
// GenericTable, hace que `.insert()/.update()` terminen tipados `never`
// (probado: hasta el ejemplo más simple posible lo reproduce, en Typescript
// 7.0.2 y en 5.9.3 por igual — no es un tema de versión del compilador).
// Mientras tanto, `supabase` en ./supabase.ts se crea sin genérico, y estos
// tipos *Insert / *Update de acá se usan a mano: como anotación del objeto
// que se manda a `.insert()/.update()`, y casteando lo que devuelve
// `.select()`. El día que corran `supabase gen types typescript` contra el
// proyecto real, ese archivo generado sí se le puede pasar a createClient.

export type PerfilUpdate = Partial<Omit<Perfil, "id">>;

export type TrackInsert = Pick<Track, "titulo" | "storage_path"> &
  Partial<Omit<Track, "id" | "titulo" | "storage_path" | "fecha_subida">>;

export type GeneroInsert = Pick<Genero, "nombre"> & Partial<Omit<Genero, "id" | "nombre">>;
export type GeneroUpdate = Partial<Omit<Genero, "id">>;

export type DescargaInsert = Pick<Descarga, "usuario_id" | "track_id"> &
  Partial<Pick<Descarga, "fecha">>;

export type DuplicadoUpdate = Partial<Pick<DuplicadoDetectado, "estado">>;

export type PlaylistInsert = Pick<Playlist, "nombre"> & Partial<Omit<Playlist, "id" | "nombre">>;

export type PlaylistTrackInsert = Pick<PlaylistTrack, "playlist_id" | "track_id"> &
  Partial<Pick<PlaylistTrack, "orden">>;

// El usuario solo puede crear un aviso de transferencia manual para SÍ
// MISMO, siempre en tipo/estado fijos — la policy "avisar_transferencia_manual_propia"
// de sql/003_pagos.sql rechaza cualquier otro valor en tipo/estado.
export interface PagoManualInsert {
  usuario_id: string;
  tipo: "manual";
  estado: "pendiente";
  comentario?: string | null;
}

export type ConfiguracionSuscripcionUpdate = Partial<
  Omit<ConfiguracionSuscripcion, "id" | "actualizado_en">
>;

export type ConfiguracionCatalogoUpdate = Partial<
  Omit<ConfiguracionCatalogo, "id" | "actualizado_en">
>;

export type PagoUpdate = Partial<Pick<Pago, "estado" | "confirmado_por">>;

export type MensajeChatInsert = Pick<MensajeChat, "usuario_id" | "mensaje">;

export type HerramientaDJInsert = Pick<HerramientaDJ, "nombre" | "link_descarga"> &
  Partial<Omit<HerramientaDJ, "id" | "nombre" | "link_descarga" | "fecha_creacion">>;

export type HerramientaDJUpdate = Partial<Omit<HerramientaDJ, "id" | "fecha_creacion">>;
