import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/*
 * Páginas del pie: Términos y Condiciones, Política de Privacidad y
 * Contacto. Los textos son un BORRADOR escrito a medida de cómo funciona
 * ClubPack hoy (catálogo privado por invitación, suscripción mensual,
 * datos en Supabase, audio en Cloudflare R2, pagos por Mercado Pago) —
 * el admin los revisa y ajusta lo que haga falta antes de darlos por
 * definitivos. Fecha de última actualización: cambiarla al editar.
 */
const ULTIMA_ACTUALIZACION = "14/11/2026";

function Legal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">{titulo}</h1>
        <p className="text-muted text-xs mt-1 m-0">Última actualización: {ULTIMA_ACTUALIZACION}</p>
      </div>
      <div className="bg-card rounded-2xl border border-border-soft p-6 sm:p-8 flex flex-col gap-5 text-sm text-body leading-relaxed [&_h2]:font-display [&_h2]:font-bold [&_h2]:text-base [&_h2]:text-ink [&_h2]:m-0 [&_p]:m-0 [&_ul]:m-0 [&_ul]:pl-5 [&_li]:mt-1">
        {children}
      </div>
    </div>
  );
}

export function TerminosPage() {
  return (
    <Legal titulo="Términos y Condiciones">
      <p>
        ClubPack es un catálogo privado de remixes, edits y versiones hechas por DJs, pensado para
        compartir música de trabajo entre colegas invitados. Al crear una cuenta y usar la
        plataforma aceptás estas condiciones.
      </p>
      <h2>1. Acceso y cuentas</h2>
      <ul>
        <li>El acceso es por invitación. Cada cuenta es personal e intransferible: no compartas tu usuario ni tu contraseña.</li>
        <li>Sin suscripción activa podés ver el catálogo completo y escuchar una muestra limitada. Escuchar el resto, descargar y armar listas requiere una suscripción activa.</li>
        <li>El administrador puede suspender o dar de baja una cuenta que incumpla estas condiciones.</li>
      </ul>
      <h2>2. Suscripción</h2>
      <ul>
        <li>La suscripción es mensual, se paga por Mercado Pago o por transferencia según lo indicado en la sección Suscripción, y se activa una vez acreditado el pago.</li>
        <li>Podés cancelarla cuando quieras; el acceso se mantiene hasta el fin del período ya pagado. No se hacen reintegros por períodos parciales.</li>
        <li>El precio puede actualizarse; cualquier cambio se avisa dentro de la plataforma antes de que aplique.</li>
      </ul>
      <h2>3. Contenido y uso de la música</h2>
      <ul>
        <li>Los temas son subidos por los propios miembros, que declaran tener derecho a compartirlos dentro del grupo (versiones, remixes y edits de su autoría, o material que están autorizados a difundir).</li>
        <li>El material descargado es para uso personal del DJ en sus presentaciones. No está permitido revenderlo, redistribuirlo fuera de ClubPack ni publicarlo en otras plataformas.</li>
        <li>Si sos titular de derechos sobre un contenido y considerás que no debería estar acá, escribinos (ver Contacto) y lo revisamos a la brevedad.</li>
        <li>El administrador puede retirar cualquier contenido sin previo aviso.</li>
      </ul>
      <h2>4. Comunidad</h2>
      <ul>
        <li>El chat y las demás funciones sociales son para hablar de música y coordinar el catálogo. No se toleran agresiones, spam ni contenido ajeno al propósito de la comunidad.</li>
        <li>Lo que publicás en el chat es visible para todos los miembros.</li>
      </ul>
      <h2>5. Disponibilidad</h2>
      <p>
        ClubPack es un proyecto de un grupo de DJs, no un servicio comercial con garantía de
        disponibilidad. Hacemos lo posible por mantenerlo andando, pero puede haber
        interrupciones, mantenimiento o cambios de funciones sin previo aviso.
      </p>
      <h2>6. Cambios en estas condiciones</h2>
      <p>
        Podemos actualizar estos términos. La fecha de arriba indica la última versión; seguir
        usando la plataforma después de un cambio implica aceptarlo.
      </p>
      <p className="text-muted">
        Consultas sobre estas condiciones: <Link to="/contacto">Contacto</Link>.
      </p>
    </Legal>
  );
}

export function PrivacidadPage() {
  return (
    <Legal titulo="Política de Privacidad">
      <p>
        Esta política explica qué datos guarda ClubPack, para qué, y qué podés hacer con ellos.
        La idea es simple: guardamos lo mínimo para que la plataforma funcione y no vendemos ni
        compartimos tus datos con terceros con fines publicitarios.
      </p>
      <h2>1. Qué datos guardamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> email, nombre de DJ y contraseña (almacenada de forma cifrada por nuestro proveedor de autenticación; nosotros nunca la vemos).</li>
        <li><strong>Suscripción y pagos:</strong> estado de tu suscripción y el registro de pagos (fecha, monto, medio). Los datos de tu tarjeta los procesa Mercado Pago; ClubPack no los recibe ni almacena.</li>
        <li><strong>Actividad en la plataforma:</strong> qué temas subiste, descargaste, escuchaste y marcaste como favoritos, con fecha. Se usa para el ranking, el Top 50, los contadores que ves en el catálogo y para que el administrador pueda dar soporte y detectar usos indebidos.</li>
        <li><strong>Chat:</strong> los mensajes y audios que compartís en Comunidad, visibles para todos los miembros.</li>
        <li><strong>Datos técnicos mínimos:</strong> la sesión iniciada y algunas preferencias (modo claro/oscuro, novedades ya vistas) se guardan en tu propio navegador.</li>
      </ul>
      <h2>2. Dónde se guardan</h2>
      <ul>
        <li>La base de datos y la autenticación corren en Supabase; los archivos de audio e imágenes, en Cloudflare R2; el servidor de la aplicación, en Render y Cloudflare. Todos con conexiones cifradas.</li>
        <li>Los archivos de audio solo se entregan mediante enlaces temporales y firmados, a cuentas con permiso para acceder a ellos.</li>
      </ul>
      <h2>3. Quién puede ver qué</h2>
      <ul>
        <li>Los demás miembros ven tu nombre de DJ, lo que publicás en el chat, los temas que subiste y los conteos agregados (p. ej. cuántos corazones tiene un tema), nunca tu historial individual de descargas o escuchas.</li>
        <li>El administrador puede ver tu email, el estado de tu suscripción y tu actividad, únicamente para operar la plataforma y dar soporte.</li>
        <li>No compartimos datos con terceros salvo los proveedores mencionados, que los procesan solo para prestar el servicio.</li>
      </ul>
      <h2>4. Tus derechos</h2>
      <ul>
        <li>Podés cambiar tu nombre de DJ desde Mi Perfil.</li>
        <li>Podés pedir la corrección o eliminación de tu cuenta y tus datos escribiéndonos (ver Contacto). Al eliminar una cuenta, los temas que subiste pueden permanecer en el catálogo sin autor asociado; tus mensajes del chat se eliminan.</li>
        <li>Si estás en Argentina, tenés además los derechos que reconoce la Ley 25.326 de Protección de Datos Personales; la Agencia de Acceso a la Información Pública es la autoridad de control.</li>
      </ul>
      <h2>5. Cambios</h2>
      <p>
        Si esta política cambia, actualizamos la fecha de arriba y lo avisamos dentro de la
        plataforma.
      </p>
      <p className="text-muted">
        Consultas sobre privacidad: <Link to="/contacto">Contacto</Link>.
      </p>
    </Legal>
  );
}

export function ContactoPage() {
  return (
    <Legal titulo="Contacto">
      <p>
        ClubPack lo administra un grupo chico de DJs, así que la forma más rápida de llegar es
        por adentro de la plataforma:
      </p>
      <ul>
        <li>
          <strong>Para cualquier consulta o pedido:</strong> escribí en{" "}
          <Link to="/chat">Comunidad</Link>; el administrador lo lee y te responde por ahí.
        </li>
        <li>
          <strong>Pagos y suscripción:</strong> la sección <Link to="/suscripcion">Suscripción</Link>{" "}
          tiene los medios de pago y el botón para avisar una transferencia.
        </li>
        <li>
          <strong>Reclamos sobre un contenido</strong> (derechos de autor, un tema que no debería
          estar): escribí en Comunidad indicando el título y el motivo; lo revisamos y, si
          corresponde, lo retiramos.
        </li>
      </ul>
    </Legal>
  );
}
