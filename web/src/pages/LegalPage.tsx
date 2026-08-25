import { Link as RouterLink } from 'react-router-dom'
import Box from '@mui/material/Box'
import Link from '@mui/material/Link'
import { useI18n } from '../i18n/I18nContext'

// NOTA: redactado por el responsable, NO asesoramiento legal profesional.
// Datos de contacto y responsable: Miguel Cabrera · admin@fontapp.net.
// Incluye un descargo de responsabilidad sobre la potabilidad del agua.
//
// OJO al tocar la app: este texto describe hechos verificables (qué datos se guardan,
// qué terceros los reciben, qué se guarda en el navegador). Si añades un servicio
// externo, una analítica o un dato nuevo, ACTUALIZA ESTO. Un aviso legal que miente
// es peor que no tenerlo.
export function LegalPage() {
  const { lang, t } = useI18n()
  return (
    <Box
      className="pad legal"
      sx={{
        maxWidth: 720,
        mx: 'auto',
        '& h1': { typography: 'h4', fontWeight: 800, mt: 1, mb: 2 },
        '& h2': { typography: 'h6', mt: 3, mb: 1 },
        '& p': { typography: 'body1', my: 1.5 },
        '& ul': { pl: 3, my: 1 },
        '& li': { typography: 'body2', my: 0.5 },
        '& code': { bgcolor: 'action.hover', px: 0.5, borderRadius: 1, fontSize: 13 },
        '& a': { color: 'primary.main' },
      }}
    >
      <Link component={RouterLink} to="/">{t('detail.backMap')}</Link>
      {lang === 'ca' ? <LegalCA />
        : lang === 'en' ? <LegalEN />
        : lang === 'fr' ? <LegalFR />
        : lang === 'pt' ? <LegalPT />
        : lang === 'gl' ? <LegalGL />
        : lang === 'eu' ? <LegalEU />
        : <LegalES />}
    </Box>
  )
}

function LegalCA() {
  return (
    <>
      <h1>Avís legal i privacitat</h1>

      <h2>⚠️ Advertència sobre l'aigua i responsabilitat</h2>
      <p className="stale-warn">
        FontApp és un servei d'informació <strong>col·laborativa</strong>: les fonts, l'estat de l'aigua i la potabilitat
        els aporten les persones usuàries i fonts de dades obertes, i poden estar <strong>desactualitzats, incomplets o ser incorrectes</strong>.
        La informació és <strong>merament orientativa</strong> i no substitueix una anàlisi oficial de l'aigua. FontApp <strong>no garanteix</strong> la
        potabilitat ni la salubritat de l'aigua de cap font. Beure aigua de les fonts que hi apareixen queda
        <strong> sota el criteri i el risc exclusiu de la persona usuària</strong>. En cas de dubte, no beguis o tracta l'aigua (bull-la o depura-la).
        Ni FontApp ni el seu responsable es fan responsables de cap dany derivat de l'ús d'aquesta informació.
      </p>

      <h2>Avís legal</h2>
      <p>
        Responsable d'aquest lloc: <strong>Miguel Cabrera</strong>. Contacte:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. L'ús del servei implica l'acceptació d'aquestes condicions.
        El contingut publicat pels usuaris (fonts, ressenyes, fotos, incidències) és responsabilitat de qui el publica.
      </p>

      <h2>Privacitat (RGPD)</h2>
      <p><strong>Responsable del tractament:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>Quines dades tractem:</strong></p>
      <ul>
        <li>El teu <strong>nom d'usuari i nom</strong>, la teva <strong>adreça de correu</strong> i la teva <strong>contrasenya</strong> (desada xifrada amb bcrypt, mai en clar).</li>
        <li>El <strong>contingut que publiques</strong>: fonts, ressenyes, valoracions, fotos i incidències.</li>
        <li>La teva <strong>ubicació precisa</strong> del navegador només s'utilitza, si l'autoritzes, per mostrar-te fonts properes; <strong>no es desa</strong> al servidor.</li>
        <li>De les <strong>fotos que puges</strong> desem, si en porten, la <strong>data i les coordenades que hi escriu el mòbil</strong> (EXIF). Només serveix per <strong>moderar</strong> —comprovar que una foto és del lloc i del moment que diu— i <strong>només ho veuen els administradors</strong>. La imatge que es publica va sense aquestes dades.</li>
        <li>En <strong>registrar-te</strong> desem la teva <strong>regió aproximada</strong> (país/regió deduïts de la IP, <strong>no la IP</strong>) i l'<strong>idioma</strong> de la interfície, per a estadística d'ús i per escriure't en la teva llengua.</li>
        <li>Si arribes des d'un <strong>cartell o una campanya</strong> amb codi (<code>fontapp.net/?p=castellcir</code>), desem aquest codi amb l'alta per saber quin cartell funciona. No identifica cap persona.</li>
      </ul>
      <p><strong>Per a què fem servir el teu correu:</strong></p>
      <ul>
        <li>Missatges necessaris del servei: benvinguda i recuperació de contrasenya.</li>
        <li>Un <strong>resum setmanal</strong> de novetats a les fonts que has afegit o on has participat. Pots desactivar-lo quan vulguis des del teu perfil o amb l'enllaç de baixa que porta cada correu, sense iniciar sessió.</li>
      </ul>
      <p>
        <strong>Finalitat i base legal:</strong> prestar el servei que sol·licites (execució) i el consentiment que atorgues en registrar-te.
        <strong> Conservació:</strong> mentre mantinguis el compte.
      </p>
      <p>
        <strong>Els teus drets:</strong> accés, rectificació, supressió, portabilitat, limitació i oposició.
        Pots <strong>esborrar el teu compte</strong> des de la mateixa app (elimina les teves dades), o escriure a{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        També pots reclamar davant l'Agència Espanyola de Protecció de Dades (AEPD).
      </p>
      <p>
        <strong>Emmagatzematge al teu navegador:</strong> <strong>no fem servir cookies</strong>. Desem al teu propi
        dispositiu: el <em>token de sessió</em> (per mantenir-te identificat), les teves preferències (idioma, tema clar/fosc,
        avisos ja llegits), el codi del cartell pel qual vas arribar i, si afegeixes alguna cosa <strong>sense cobertura</strong>,
        la teva aportació i la foto en una cua local fins que hi hagi xarxa. També hi desem un <strong>historial curt de cerques</strong> (les últimes que has triat i les fonts que has obert des del cercador); <strong>no surt mai del teu dispositiu</strong> i el pots esborrar amb el botó «Esborra» del propi cercador. Tot això es queda al teu dispositiu i pots
        esborrar-ho buidant les dades del lloc al navegador.
      </p>
      <p>
        <strong>Analítica:</strong> fem servir <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        que mesura visites de forma <strong>agregada, sense cookies i sense identificar-te</strong>; per això no et demanem
        consentiment. També comptem algunes visites i interaccions amb els botons mitjançant un identificador aleatori de
        pestanya: només desem el tipus d'acció, el dia i el recompte, mai l'usuari, la IP, l'URL ni el dispositiu, i ho
        eliminem al cap de 180 dies; després només en queda el total diari anònim. Classifiquem localment cada sessió només com iOS/iPadOS, Android, un altre mòbil o escriptori i com a PWA instal·lada o navegador; no desem user-agent, model, versió ni resolució. Si tens la sessió iniciada, desem també al teu compte quan obres «Suport» o Aixeta, quantes vegades i l'última data, per mesurar l'interès a sostenir el servei. Aquest detall s'elimina al cap de 180 dies o en eliminar el compte. També actualitzem l'hora de la teva última activitat mentre fas servir la web; només els administradors poden veure si un compte ha estat actiu durant els últims 10 minuts, sense IP, pàgina ni dispositiu. No fem servir Google Analytics ni cap xarxa publicitària, i no venem ni cedim dades a ningú.
      </p>
      <p><strong>Qui tracta dades per encàrrec nostre:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (servidor) i <strong>Neon</strong> (base de dades PostgreSQL).</li>
        <li><strong>Cloudflare</strong>: web i CDN, analítica agregada i emmagatzematge de les fotos (R2).</li>
        <li><strong>Resend</strong>: enviament dels correus (rep la teva adreça i el contingut del missatge).</li>
        <li><strong>ip-api.com</strong>: només en el moment de registrar-te, per deduir el país i la regió. <strong>Rep la teva IP</strong>, que nosaltres no desem enlloc.</li>
      </ul>

      <h2>Dades cartogràfiques</h2>
      <p>
        El mapa base i les dades de fonts provenen d'{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © col·laboradors d'OpenStreetMap, sota llicència{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.
        {' '}Part de les fonts provenen de l'<a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> i
        l'ACA, sota llicència <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      </p>
    </>
  )
}

function LegalES() {
  return (
    <>
      <h1>Aviso legal y privacidad</h1>

      <h2>⚠️ Advertencia sobre el agua y responsabilidad</h2>
      <p className="stale-warn">
        FontApp es un servicio de información <strong>colaborativa</strong>: las fuentes, el estado del agua y la potabilidad
        los aportan las personas usuarias y fuentes de datos abiertas, y pueden estar <strong>desactualizados, incompletos o ser incorrectos</strong>.
        La información es <strong>meramente orientativa</strong> y no sustituye un análisis oficial del agua. FontApp <strong>no garantiza</strong> la
        potabilidad ni la salubridad del agua de ninguna fuente. Beber agua de las fuentes que aparecen queda
        <strong> bajo el criterio y el riesgo exclusivo de la persona usuaria</strong>. En caso de duda, no bebas o trata el agua (hiérvela o depúrala).
        Ni FontApp ni su responsable se hacen responsables de ningún daño derivado del uso de esta información.
      </p>

      <h2>Aviso legal</h2>
      <p>
        Responsable de este sitio: <strong>Miguel Cabrera</strong>. Contacto:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. El uso del servicio implica la aceptación de estas condiciones.
        El contenido publicado por los usuarios (fuentes, reseñas, fotos, incidencias) es responsabilidad de quien lo publica.
      </p>

      <h2>Privacidad (RGPD)</h2>
      <p><strong>Responsable del tratamiento:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>Qué datos tratamos:</strong></p>
      <ul>
        <li>Tu <strong>nombre de usuario y nombre</strong>, tu <strong>dirección de correo</strong> y tu <strong>contraseña</strong> (almacenada cifrada con bcrypt, nunca en claro).</li>
        <li>El <strong>contenido que publicas</strong>: fuentes, reseñas, valoraciones, fotos e incidencias.</li>
        <li>Tu <strong>ubicación precisa</strong> del navegador solo se usa, si tú lo autorizas, para mostrarte fuentes cercanas; <strong>no se almacena</strong> en el servidor.</li>
        <li>De las <strong>fotos que subes</strong> guardamos, si las llevan, la <strong>fecha y las coordenadas que escribe el móvil</strong> (EXIF). Solo sirve para <strong>moderar</strong> —comprobar que una foto es del sitio y del momento que dice— y <strong>solo lo ven los administradores</strong>. La imagen que se publica va sin esos datos.</li>
        <li>Al <strong>registrarte</strong> guardamos tu <strong>región aproximada</strong> (país/región deducidos de la IP, <strong>no la IP</strong>) y el <strong>idioma</strong> de la interfaz, para estadística de uso y para escribirte en tu lengua.</li>
        <li>Si llegas desde un <strong>cartel o una campaña</strong> con código (<code>fontapp.net/?p=castellcir</code>), guardamos ese código con el alta para saber qué cartel funciona. No identifica a ninguna persona.</li>
      </ul>
      <p><strong>Para qué usamos tu correo:</strong></p>
      <ul>
        <li>Mensajes necesarios del servicio: bienvenida y recuperación de contraseña.</li>
        <li>Un <strong>resumen semanal</strong> de novedades en las fuentes que has añadido o donde has participado. Puedes desactivarlo cuando quieras desde tu perfil o con el enlace de baja que lleva cada correo, sin iniciar sesión.</li>
      </ul>
      <p>
        <strong>Finalidad y base legal:</strong> prestar el servicio que solicitas (ejecución) y el consentimiento que otorgas al registrarte.
        <strong> Conservación:</strong> mientras mantengas la cuenta.
      </p>
      <p>
        <strong>Tus derechos:</strong> acceso, rectificación, supresión, portabilidad, limitación y oposición.
        Puedes <strong>borrar tu cuenta</strong> desde la propia app (elimina tus datos), o escribir a{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        También puedes reclamar ante la Agencia Española de Protección de Datos (AEPD).
      </p>
      <p>
        <strong>Almacenamiento en tu navegador:</strong> <strong>no usamos cookies</strong>. Guardamos en tu propio
        dispositivo: el <em>token de sesión</em> (para mantenerte identificado), tus preferencias (idioma, tema claro/oscuro,
        avisos ya leídos), el código del cartel por el que llegaste y, si añades algo <strong>sin cobertura</strong>,
        tu aportación y la foto en una cola local hasta que haya red. También guardamos ahí un <strong>historial corto de búsquedas</strong> (las últimas que elegiste y las fuentes que abriste desde el buscador); <strong>nunca sale de tu dispositivo</strong> y puedes borrarlo con el botón «Borrar» del propio buscador. Todo eso se queda en tu dispositivo y puedes
        borrarlo vaciando los datos del sitio en el navegador.
      </p>
      <p>
        <strong>Analítica:</strong> usamos <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        que mide visitas de forma <strong>agregada, sin cookies y sin identificarte</strong>; por eso no te pedimos
        consentimiento. También contamos algunas visitas e interacciones con los botones mediante un identificador aleatorio de
        pestaña: solo guardamos el tipo de acción, el día y el recuento, nunca el usuario, la IP, la URL ni el dispositivo, y lo
        eliminamos a los 180 días; después solo queda el total diario anónimo. Clasificamos localmente cada sesión únicamente como iOS/iPadOS, Android, otro móvil o escritorio y como PWA instalada o navegador; no guardamos el user-agent, modelo, versión ni resolución. Si has iniciado sesión, también guardamos en tu cuenta cuándo abres «Apoyar» o Aixeta, cuántas veces y la última fecha, para medir el interés en sostener el servicio. Este detalle se elimina a los 180 días o al eliminar la cuenta. También actualizamos la hora de tu última actividad mientras utilizas la web; solo los administradores pueden ver si una cuenta estuvo activa durante los últimos 10 minutos, sin IP, página ni dispositivo. No usamos Google Analytics ni ninguna red publicitaria, y no vendemos ni cedemos datos a nadie.
      </p>
      <p><strong>Quién trata datos por encargo nuestro:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (servidor) y <strong>Neon</strong> (base de datos PostgreSQL).</li>
        <li><strong>Cloudflare</strong>: web y CDN, analítica agregada y almacenamiento de las fotos (R2).</li>
        <li><strong>Resend</strong>: envío de los correos (recibe tu dirección y el contenido del mensaje).</li>
        <li><strong>ip-api.com</strong>: solo en el momento de registrarte, para deducir el país y la región. <strong>Recibe tu IP</strong>, que nosotros no guardamos en ningún sitio.</li>
      </ul>

      <h2>Datos cartográficos</h2>
      <p>
        El mapa base y los datos de fuentes proceden de{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © colaboradores de OpenStreetMap, bajo licencia{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.
        {' '}Parte de las fuentes provienen del <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> y
        la ACA, bajo licencia <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      </p>
    </>
  )
}

function LegalPT() {
  return (
    <>
      <h1>Aviso legal e privacidade</h1>

      <h2>⚠️ Aviso sobre a água e responsabilidade</h2>
      <p className="stale-warn">
        O FontApp é um serviço de informação <strong>colaborativa</strong>: as fontes, o estado da água e a potabilidade
        são indicados pelos utilizadores e por fontes de dados abertos, e podem estar <strong>desatualizados, incompletos ou incorretos</strong>.
        A informação é <strong>meramente indicativa</strong> e não substitui uma análise oficial da água. O FontApp <strong>não garante</strong> a
        potabilidade nem a salubridade da água de qualquer fonte. Beber água das fontes apresentadas fica
        <strong> ao critério e por conta e risco exclusivo do utilizador</strong>. Em caso de dúvida, não bebas a água ou trata-a (ferve-a ou purifica-a).
        Nem o FontApp nem o seu responsável respondem por danos resultantes da utilização desta informação.
      </p>

      <h2>Aviso legal</h2>
      <p>
        Responsável por este site: <strong>Miguel Cabrera</strong>. Contacto:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. A utilização do serviço implica a aceitação destas condições.
        O conteúdo publicado pelos utilizadores (fontes, avaliações, fotografias e ocorrências) é da responsabilidade de quem o publica.
      </p>

      <h2>Privacidade (RGPD)</h2>
      <p><strong>Responsável pelo tratamento:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>Dados que tratamos:</strong></p>
      <ul>
        <li>O teu <strong>nome de utilizador e nome</strong>, o teu <strong>endereço de email</strong> e a tua <strong>palavra-passe</strong> (armazenada com hash bcrypt, nunca em texto simples).</li>
        <li>O <strong>conteúdo que publicas</strong>: fontes, avaliações, classificações, fotografias e ocorrências.</li>
        <li>A tua <strong>localização exata</strong> no navegador só é utilizada, com a tua autorização, para mostrar fontes próximas; <strong>não é armazenada</strong> no servidor.</li>
        <li>Das <strong>fotografias que carregas</strong> guardamos, quando existirem, a <strong>data e as coordenadas registadas pelo telemóvel</strong> (EXIF). Servem apenas para <strong>moderação</strong> — confirmar o local e o momento da fotografia — e <strong>só os administradores lhes têm acesso</strong>. A imagem publicada não contém estes dados.</li>
        <li>Ao <strong>registares-te</strong>, guardamos a tua <strong>região aproximada</strong> (país/região deduzidos a partir do IP, <strong>não o próprio IP</strong>) e o <strong>idioma</strong> da interface, para estatísticas de utilização e para comunicarmos contigo no teu idioma.</li>
        <li>Se chegares através de um <strong>cartaz ou campanha</strong> com um código (<code>fontapp.net/?p=castellcir</code>), associamos esse código ao registo para saber que cartaz funciona. Não identifica qualquer pessoa.</li>
      </ul>
      <p><strong>Para que utilizamos o teu email:</strong></p>
      <ul>
        <li>Mensagens necessárias ao serviço: boas-vindas e recuperação da palavra-passe.</li>
        <li>Um <strong>resumo semanal</strong> das novidades nas fontes que adicionaste ou em que participaste. Podes desativá-lo a qualquer momento no teu perfil ou através da ligação de cancelamento presente em cada email, sem iniciares sessão.</li>
      </ul>
      <p>
        <strong>Finalidade e fundamento jurídico:</strong> prestar o serviço que solicitas (execução) e o consentimento dado no registo.
        <strong> Conservação:</strong> enquanto mantiveres a conta.
      </p>
      <p>
        <strong>Os teus direitos:</strong> acesso, retificação, apagamento, portabilidade, limitação e oposição.
        Podes <strong>eliminar a tua conta</strong> na própria aplicação (elimina os teus dados) ou escrever para{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        Também podes apresentar uma reclamação à autoridade de proteção de dados competente.
      </p>
      <p>
        <strong>Armazenamento no navegador:</strong> <strong>não utilizamos cookies</strong>. Guardamos no teu dispositivo:
        o <em>token de sessão</em> (para manter a sessão iniciada), as tuas preferências (idioma, tema claro/escuro e avisos já lidos),
        o código do cartaz através do qual chegaste e, se adicionares algo <strong>sem rede</strong>, a tua contribuição e a fotografia
        numa fila local até a ligação regressar. Guardamos aí também um <strong>histórico curto de pesquisas</strong> (as últimas que escolheste e as fontes que abriste a partir da pesquisa); <strong>nunca sai do teu dispositivo</strong> e podes apagá-lo com o botão «Apagar» da própria pesquisa. Tudo permanece no teu dispositivo e pode ser apagado eliminando os dados do site no navegador.
      </p>
      <p>
        <strong>Analítica:</strong> utilizamos <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        que mede visitas de forma <strong>agregada, sem cookies e sem te identificar</strong>; por isso não solicitamos consentimento.
        Também contamos algumas visitas e interações com botões através de um identificador aleatório por separador: guardamos apenas
        o tipo de ação, o dia e a contagem, nunca o utilizador, IP, URL ou dispositivo. Ao fim de 180 dias eliminamos o identificador
        e mantemos apenas os totais diários anónimos. Classificamos localmente cada sessão apenas como iOS/iPadOS, Android, outro
        dispositivo móvel ou computador e como PWA instalada ou navegador; não guardamos user-agent, modelo, versão ou resolução.
        Se tiveres sessão iniciada, associamos à tua conta a abertura de «Apoiar» ou Aixeta, o número de vezes e a data mais recente,
        para medir o interesse em sustentar o serviço. Este detalhe é eliminado após 180 dias ou quando a conta é eliminada.
        Atualizamos ainda a hora da tua última atividade enquanto utilizas a web; apenas os administradores podem ver se uma conta
        esteve ativa nos últimos 10 minutos, sem IP, página ou dispositivo. Não utilizamos Google Analytics nem redes publicitárias
        e não vendemos nem cedemos dados a terceiros.
      </p>
      <p><strong>Subcontratantes que tratam dados por nossa conta:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (servidor) e <strong>Neon</strong> (base de dados PostgreSQL).</li>
        <li><strong>Cloudflare</strong>: web e CDN, analítica agregada e armazenamento das fotografias (R2).</li>
        <li><strong>Resend</strong>: envio de emails (recebe o teu endereço e o conteúdo da mensagem).</li>
        <li><strong>ip-api.com</strong>: apenas no momento do registo, para deduzir o país e a região. <strong>Recebe o teu IP</strong>, que não guardamos.</li>
      </ul>

      <h2>Dados cartográficos</h2>
      <p>
        O mapa base e os dados das fontes provêm do{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © colaboradores do OpenStreetMap, sob a licença{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.
        {' '}Algumas fontes provêm do <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> e da
        ACA, sob a licença <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      </p>
    </>
  )
}

function LegalEN() {
  return (
    <>
      <h1>Legal notice & privacy</h1>

      <h2>⚠️ Water safety & liability disclaimer</h2>
      <p className="stale-warn">
        FontApp is a <strong>collaborative</strong> information service: fountains, water status and potability are contributed
        by users and open data sources, and may be <strong>outdated, incomplete or incorrect</strong>.
        The information is <strong>indicative only</strong> and does not replace an official water analysis. FontApp <strong>does not guarantee</strong> the
        potability or safety of the water at any fountain. Drinking water from the fountains listed here is
        <strong> at the user's sole discretion and risk</strong>. When in doubt, do not drink, or treat the water (boil or purify it).
        Neither FontApp nor its owner is liable for any harm arising from the use of this information.
      </p>

      <h2>Legal notice</h2>
      <p>
        Owner of this site: <strong>Miguel Cabrera</strong>. Contact:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. Using the service implies acceptance of these terms.
        Content published by users (fountains, reviews, photos, issues) is the responsibility of whoever posts it.
      </p>

      <h2>Privacy (GDPR)</h2>
      <p><strong>Data controller:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>What data we process:</strong></p>
      <ul>
        <li>Your <strong>username and name</strong>, your <strong>email address</strong> and your <strong>password</strong> (stored hashed with bcrypt, never in clear text).</li>
        <li>The <strong>content you publish</strong>: fountains, reviews, ratings, photos and issues.</li>
        <li>Your <strong>browser location</strong> is only used, if you allow it, to show you nearby fountains; it is <strong>not stored</strong> on the server.</li>
        <li>From the <strong>photos you upload</strong> we store, when present, the <strong>date and coordinates your phone writes into them</strong> (EXIF). It is used only for <strong>moderation</strong> — checking a photo is from the place and moment it claims — and <strong>only administrators can see it</strong>. The published image carries none of it.</li>
        <li>When you <strong>sign up</strong> we store your <strong>approximate region</strong> (country/region derived from your IP — <strong>not the IP</strong>) and your interface <strong>language</strong>, for usage statistics and to write to you in your language.</li>
        <li>If you arrive from a <strong>poster or campaign</strong> carrying a code (<code>fontapp.net/?p=castellcir</code>), we store that code with your sign-up to learn which poster works. It identifies no one.</li>
      </ul>
      <p><strong>What we use your email for:</strong></p>
      <ul>
        <li>Service messages: welcome and password recovery.</li>
        <li>A <strong>weekly round-up</strong> of activity on the fountains you added or took part in. You can turn it off any time from your profile, or with the unsubscribe link in every email — no sign-in needed.</li>
      </ul>
      <p>
        <strong>Purpose and legal basis:</strong> to provide the service you request (performance) and the consent you give when signing up.
        <strong> Retention:</strong> as long as you keep your account.
      </p>
      <p>
        <strong>Your rights:</strong> access, rectification, erasure, portability, restriction and objection.
        You can <strong>delete your account</strong> from within the app (it removes your data), or write to{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        You may also complain to your data protection authority.
      </p>
      <p>
        <strong>Storage in your browser:</strong> <strong>we use no cookies</strong>. We keep on your own device: the
        <em> session token</em> (to keep you signed in), your preferences (language, light/dark theme, notices already seen),
        the poster code you arrived with and, if you add something <strong>with no signal</strong>, your contribution and its
        photo in a local queue until the network is back. We also keep a <strong>short search history</strong> there (the last
        searches you picked and the fountains you opened from the search box); it <strong>never leaves your device</strong>
        and you can wipe it with the “Clear” button in the search box itself. All of it stays on your device and you can
        clear it by deleting the site data in your browser.
      </p>
      <p>
        <strong>Analytics:</strong> we use <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        which measures visits in <strong>aggregate, without cookies and without identifying you</strong> — which is why we
        ask for no consent. We also count selected page visits and button interactions using a random per-tab identifier: we
        store only the action type, day and count, never the user, IP, URL or device. After 180 days we remove the random identifier and retain only anonymous daily totals. We locally classify each session only as iOS/iPadOS, Android, other mobile or desktop and as installed PWA or browser; we store no user-agent, model, version or resolution. We use no
        Google Analytics and no ad network, and we neither sell nor share your data. When you are signed in, we also associate opening Support or Aixeta with your account, including the count and latest date, to measure interest in sustaining the service. We remove this detail after 180 days or when the account is deleted. We also update your latest activity time while you use the site; only administrators can see whether an account was active within the last 10 minutes, without an IP, page or device.
      </p>
      <p><strong>Processors acting on our behalf:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (server) and <strong>Neon</strong> (PostgreSQL database).</li>
        <li><strong>Cloudflare</strong>: web and CDN, aggregate analytics and photo storage (R2).</li>
        <li><strong>Resend</strong>: email delivery (receives your address and the message content).</li>
        <li><strong>ip-api.com</strong>: only at sign-up, to derive country and region. <strong>It receives your IP</strong>, which we store nowhere.</li>
      </ul>

      <h2>Map data</h2>
      <p>
        The base map and fountain data come from{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © OpenStreetMap contributors, under the{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a> licence.
        {' '}Some fountains come from the <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> and
        ACA, under the <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> licence.
      </p>
    </>
  )
}

function LegalFR() {
  return (
    <>
      <h1>Mentions légales et confidentialité</h1>
      <h2>⚠️ Sécurité de l’eau et exclusion de responsabilité</h2>
      <p className="stale-warn">
        FontApp est un service d’information <strong>collaboratif</strong> : les fontaines, leur débit et leur potabilité
        proviennent des utilisateurs et de données ouvertes et peuvent être <strong>obsolètes, incomplets ou erronés</strong>.
        Ces informations sont fournies <strong>à titre indicatif</strong> et ne remplacent pas une analyse officielle.
        FontApp <strong>ne garantit pas</strong> la potabilité ni la sécurité de l’eau. La boire relève de la
        <strong> seule décision et responsabilité de l’utilisateur</strong>. En cas de doute, ne la buvez pas ou traitez-la.
        Ni FontApp ni son propriétaire ne répondent d’un dommage résultant de l’utilisation de ces informations.
      </p>
      <h2>Mentions légales</h2>
      <p>
        Propriétaire du site : <strong>Miguel Cabrera</strong>. Contact :{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. L’utilisation du service implique l’acceptation de ces conditions.
        Les contenus publiés par les utilisateurs relèvent de la responsabilité de leur auteur.
      </p>
      <h2>Confidentialité (RGPD)</h2>
      <p><strong>Responsable du traitement :</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>Données traitées :</strong></p>
      <ul>
        <li>Votre <strong>nom d’utilisateur et votre nom</strong>, votre <strong>adresse e-mail</strong> et votre <strong>mot de passe</strong> (haché avec bcrypt, jamais stocké en clair).</li>
        <li>Le <strong>contenu publié</strong> : fontaines, avis, évaluations, photos et signalements.</li>
        <li>Votre <strong>position</strong> sert uniquement, avec votre autorisation, à afficher les fontaines proches ; elle <strong>n’est pas stockée</strong> sur le serveur.</li>
        <li>Pour les <strong>photos envoyées</strong>, nous conservons, lorsqu’elles existent, la date et les coordonnées EXIF, uniquement à des fins de <strong>modération</strong>. <strong>Seuls les administrateurs y ont accès</strong> et l’image publiée ne les contient pas.</li>
        <li>À l’<strong>inscription</strong>, nous conservons votre <strong>région approximative</strong> (déduite de l’IP, <strong>pas l’IP elle-même</strong>) et la <strong>langue</strong> de l’interface, pour les statistiques et pour vous écrire dans votre langue.</li>
        <li>Si vous venez d’une <strong>affiche ou campagne</strong> munie d’un code (<code>fontapp.net/?p=castellcir</code>), ce code est associé à l’inscription pour mesurer son efficacité. Il n’identifie personne.</li>
      </ul>
      <p><strong>Utilisation de votre adresse e-mail :</strong></p>
      <ul>
        <li>Messages de service : bienvenue et récupération du mot de passe.</li>
        <li>Un <strong>récapitulatif hebdomadaire</strong> de l’activité des fontaines auxquelles vous avez contribué, désactivable depuis votre profil ou grâce au lien présent dans chaque e-mail.</li>
      </ul>
      <p><strong>Finalité et base juridique :</strong> fournir le service demandé et le consentement donné à l’inscription. <strong>Conservation :</strong> tant que votre compte existe.</p>
      <p>
        <strong>Vos droits :</strong> accès, rectification, effacement, portabilité, limitation et opposition.
        Vous pouvez <strong>supprimer votre compte</strong> depuis l’application ou écrire à{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. Vous pouvez aussi saisir votre autorité de protection des données.
      </p>
      <p>
        <strong>Stockage dans votre navigateur :</strong> <strong>nous n’utilisons aucun cookie</strong>. Nous conservons sur votre appareil
        le jeton de session, vos préférences, le code de campagne et vos contributions hors connexion jusqu’au retour du réseau.
        Nous y conservons aussi un <strong>court historique de recherches</strong> (les dernières que vous avez choisies et les
        fontaines ouvertes depuis la recherche) ; il <strong>ne quitte jamais votre appareil</strong> et vous pouvez l’effacer
        avec le bouton « Effacer » de la recherche elle-même.
        Vous pouvez tout effacer en supprimant les données du site dans votre navigateur.
      </p>
      <p>
        <strong>Mesure d’audience :</strong> nous utilisons <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        qui mesure les visites de façon <strong>agrégée, sans cookies et sans vous identifier</strong>. Nous comptons aussi certaines interactions grâce à un identifiant aléatoire propre à l’onglet : seuls le type d’action, le jour et le nombre sont conservés, jamais l’utilisateur, l’IP, l’URL ou l’appareil. Après 180 jours, l’identifiant est supprimé et seul le total quotidien anonyme subsiste. Nous classons localement chaque session uniquement comme iOS/iPadOS, Android, autre mobile ou ordinateur et comme PWA installée ou navigateur, sans conserver user-agent, modèle, version ou résolution. Si vous êtes connecté, nous associons aussi à votre compte l’ouverture de Soutenir ou d’Aixeta, le nombre et la dernière date, afin de mesurer l’intérêt à soutenir le service. Ce détail est supprimé après 180 jours ou avec le compte. Nous actualisons aussi l’heure de votre dernière activité pendant l’utilisation du site ; seuls les administrateurs peuvent voir si un compte a été actif au cours des 10 dernières minutes, sans IP, page ni appareil. Nous n’utilisons ni Google Analytics ni réseau publicitaire et ne vendons ni ne partageons vos données.
      </p>
      <p><strong>Sous-traitants :</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (serveur) et <strong>Neon</strong> (base PostgreSQL).</li>
        <li><strong>Cloudflare</strong> : web et CDN, statistiques agrégées et stockage des photos (R2).</li>
        <li><strong>Resend</strong> : envoi des e-mails.</li>
        <li><strong>ip-api.com</strong> : uniquement à l’inscription, pour déterminer le pays et la région. <strong>Il reçoit votre IP</strong>, que nous ne stockons pas.</li>
      </ul>
      <h2>Données cartographiques</h2>
      <p>
        Le fond de carte et les données proviennent d’<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © contributeurs OpenStreetMap, sous licence <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.
        {' '}Certaines fontaines proviennent de l’<a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> et de l’ACA,
        sous licence <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      </p>
    </>
  )
}

function LegalGL() {
  return (
    <>
      <h1>Aviso legal e privacidade</h1>

      <h2>⚠️ Advertencia sobre a auga e responsabilidade</h2>
      <p className="stale-warn">
        FontApp é un servizo de información <strong>colaborativa</strong>: as fontes, o estado da auga e a potabilidade
        achégaas a xente usuaria e fontes de datos abertas, e poden estar <strong>desactualizados, incompletos ou ser incorrectos</strong>.
        A información é <strong>meramente orientativa</strong> e non substitúe unha análise oficial da auga. FontApp <strong>non garante</strong> a
        potabilidade nin a salubridade da auga de ningunha fonte. Beber auga das fontes que aparecen queda
        <strong> baixo o criterio e o risco exclusivo da persoa usuaria</strong>. En caso de dúbida, non bebas ou trata a auga (fervea ou depúraa).
        Nin FontApp nin o seu responsable se fan responsables de ningún dano derivado do uso desta información.
      </p>

      <h2>Aviso legal</h2>
      <p>
        Responsable deste sitio: <strong>Miguel Cabrera</strong>. Contacto:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. O uso do servizo implica a aceptación destas condicións.
        O contido publicado polas persoas usuarias (fontes, reseñas, fotos, incidencias) é responsabilidade de quen o publica.
      </p>

      <h2>Privacidade (RXPD)</h2>
      <p><strong>Responsable do tratamento:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>Que datos tratamos:</strong></p>
      <ul>
        <li>O teu <strong>nome de usuario e nome</strong>, o teu <strong>enderezo de correo</strong> e o teu <strong>contrasinal</strong> (gardado cifrado con bcrypt, nunca en claro).</li>
        <li>O <strong>contido que publicas</strong>: fontes, reseñas, valoracións, fotos e incidencias.</li>
        <li>A túa <strong>localización precisa</strong> do navegador só se usa, se ti o autorizas, para amosarche fontes próximas; <strong>non se garda</strong> no servidor.</li>
        <li>Das <strong>fotos que subes</strong> gardamos, se as levan, a <strong>data e as coordenadas que escribe o móbil</strong> (EXIF). Só serve para <strong>moderar</strong> e <strong>só o ven os administradores</strong>. A imaxe que se publica vai sen eses datos.</li>
        <li>Ao <strong>rexistrarte</strong> gardamos a túa <strong>rexión aproximada</strong> (país/rexión deducidos da IP, <strong>non a IP</strong>) e o <strong>idioma</strong> da interface, para estatística de uso e para escribirche na túa lingua.</li>
        <li>Se chegas desde un <strong>cartel ou unha campaña</strong> con código (<code>fontapp.net/?p=castellcir</code>), gardamos ese código coa alta para saber que cartel funciona. Non identifica a ninguén.</li>
      </ul>
      <p><strong>Para que usamos o teu correo:</strong></p>
      <ul>
        <li>Mensaxes necesarias do servizo: benvida e recuperación de contrasinal.</li>
        <li>Un <strong>resumo semanal</strong> de novidades nas fontes que engadiches ou onde participaches. Podes desactivalo cando queiras desde o teu perfil ou coa ligazón de baixa que leva cada correo, sen iniciar sesión.</li>
      </ul>
      <p>
        <strong>Finalidade e base legal:</strong> prestar o servizo que solicitas (execución) e o consentimento que outorgas ao rexistrarte.
        <strong> Conservación:</strong> mentres manteñas a conta.
      </p>
      <p>
        <strong>Os teus dereitos:</strong> acceso, rectificación, supresión, portabilidade, limitación e oposición.
        Podes <strong>borrar a túa conta</strong> desde a propia app (elimina os teus datos), ou escribir a{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        Tamén podes reclamar ante a Axencia Española de Protección de Datos (AEPD).
      </p>
      <p>
        <strong>Almacenamento no teu navegador:</strong> <strong>non usamos cookies</strong>. Gardamos no teu propio
        dispositivo: o <em>token de sesión</em> (para manterte identificado), as túas preferencias (idioma, tema claro/escuro,
        avisos xa lidos), o código do cartel polo que chegaches e, se engades algo <strong>sen cobertura</strong>,
        a túa achega e a foto nunha cola local ata que haxa rede. Tamén gardamos aí un <strong>historial curto de buscas</strong>
        (as últimas que escolliches e as fontes que abriches desde o buscador); <strong>nunca sae do teu dispositivo</strong> e
        podes borralo co botón «Borrar» do propio buscador. Todo iso queda no teu dispositivo e podes
        borralo baleirando os datos do sitio no navegador.
      </p>
      <p>
        <strong>Analítica:</strong> usamos <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a>,
        que mide visitas de forma <strong>agregada, sen cookies e sen identificarte</strong>; por iso non che pedimos
        consentimento. Tamén contamos algunhas visitas e interaccións cos botóns cun identificador aleatorio por pestana: só
        gardamos o tipo de acción, o día e o reconto, nunca o usuario, a IP, o URL nin o dispositivo. Aos 180 días eliminamos o identificador e só queda o total diario anónimo. Clasificamos localmente cada sesión só como iOS/iPadOS, Android, outro móbil ou escritorio e como PWA instalada ou navegador; non gardamos user-agent, modelo, versión nin resolución.
        Se iniciaches sesión, tamén asociamos á túa conta cando abres «Apoiar» ou Aixeta, cantas veces e a última data, para medir o interese en soster o servizo. Este detalle elimínase aos 180 días ou ao eliminar a conta. Tamén actualizamos a hora da túa última actividade mentres usas a web; só os administradores poden ver se unha conta estivo activa nos últimos 10 minutos, sen IP, páxina nin dispositivo. Non usamos Google Analytics nin ningunha rede publicitaria, e non vendemos nin cedemos datos a ninguén.
      </p>
      <p><strong>Quen trata datos por encarga nosa:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (servidor) e <strong>Neon</strong> (base de datos PostgreSQL).</li>
        <li><strong>Cloudflare</strong>: web e CDN, analítica agregada e almacenamento das fotos (R2).</li>
        <li><strong>Resend</strong>: envío dos correos (recibe o teu enderezo e o contido da mensaxe).</li>
        <li><strong>ip-api.com</strong>: só no momento de rexistrarte, para deducir o país e a rexión. <strong>Recibe a túa IP</strong>, que nós non gardamos en ningún sitio.</li>
      </ul>

      <h2>Datos cartográficos</h2>
      <p>
        O mapa base e os datos de fontes proceden de{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>,
        © colaboradores de OpenStreetMap, baixo licenza{' '}
        <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a>.
        {' '}Parte das fontes proveñen do <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a> e
        a ACA, baixo licenza <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>.
      </p>
    </>
  )
}

function LegalEU() {
  return (
    <>
      <h1>Lege oharra eta pribatutasuna</h1>

      <h2>⚠️ Urari buruzko oharra eta erantzukizuna</h2>
      <p className="stale-warn">
        FontApp informazio <strong>kolaboratiboko</strong> zerbitzu bat da: iturriak, uraren egoera eta edangarritasuna
        erabiltzaileek eta datu irekien iturriek ekartzen dituzte, eta <strong>zaharkituta, osatu gabe edo oker</strong> egon daitezke.
        Informazioa <strong>orientagarria besterik ez da</strong> eta ez du uraren azterketa ofizial bat ordezkatzen. FontApp-ek <strong>ez du bermatzen</strong>
        inongo iturriren uraren edangarritasuna edo osasungarritasuna. Hemen agertzen diren iturrietako ura edatea
        <strong> erabiltzailearen irizpide eta arrisku hutsez</strong> egiten da. Zalantzarik izanez gero, ez edan edo tratatu ura (irakin edo araztu).
        Ez FontApp-ek ez haren arduradunak ez dute erantzukizunik informazio hau erabiltzeagatik sor daitekeen kalteagatik.
      </p>

      <h2>Lege oharra</h2>
      <p>
        Gune honen arduraduna: <strong>Miguel Cabrera</strong>. Harremana:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>. Zerbitzua erabiltzeak baldintza hauek onartzea dakar.
        Erabiltzaileek argitaratutako edukia (iturriak, iritziak, argazkiak, oharrak) argitaratzen duenaren erantzukizuna da.
      </p>

      <h2>Pribatutasuna (DBEO)</h2>
      <p><strong>Tratamenduaren arduraduna:</strong> Miguel Cabrera, <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.</p>
      <p><strong>Zer datu tratatzen ditugun:</strong></p>
      <ul>
        <li>Zure <strong>erabiltzaile-izena eta izena</strong>, zure <strong>helbide elektronikoa</strong> eta zure <strong>pasahitza</strong> (bcrypt-ekin zifratuta gordeta, inoiz ez testu lauan).</li>
        <li><strong>Argitaratzen duzun edukia</strong>: iturriak, iritziak, balorazioak, argazkiak eta oharrak.</li>
        <li>Nabigatzailearen <strong>kokapen zehatza</strong> baimentzen baduzu bakarrik erabiltzen da, inguruko iturriak erakusteko; <strong>ez da gordetzen</strong> zerbitzarian.</li>
        <li><strong>Igotzen dituzun argazkietatik</strong>, baldin badakartzate, mugikorrak idazten dituen <strong>data eta koordenatuak</strong> gordetzen ditugu (EXIF). <strong>Moderatzeko</strong> baino ez da —argazkia dioen lekukoa eta unekoa den egiaztatzeko— eta <strong>administratzaileek soilik ikusten dute</strong>. Argitaratzen den irudiak ez darama datu horietako bat ere.</li>
        <li><strong>Izena ematean</strong> zure <strong>gutxi gorabeherako eskualdea</strong> (IPtik ondorioztatutako herrialdea/eskualdea, <strong>ez IPa</strong>) eta interfazearen <strong>hizkuntza</strong> gordetzen ditugu, erabilera-estatistiketarako eta zure hizkuntzan idazteko.</li>
        <li>Kodea duen <strong>kartel edo kanpaina</strong> batetik iristen bazara (<code>fontapp.net/?p=castellcir</code>), kode hori altarekin batera gordetzen dugu, zein kartelek funtzionatzen duen jakiteko. Ez du inor identifikatzen.</li>
      </ul>
      <p><strong>Zertarako erabiltzen dugun zure helbide elektronikoa:</strong></p>
      <ul>
        <li>Zerbitzuaren beharrezko mezuak: ongi etorria eta pasahitza berreskuratzea.</li>
        <li>Gehitu dituzun edo parte hartu duzun iturrietako berrien <strong>asteko laburpena</strong>. Nahi duzunean desaktiba dezakezu zure profiletik edo mezu bakoitzak daraman baja-estekatik, saiorik hasi gabe.</li>
      </ul>
      <p>
        <strong>Helburua eta oinarri juridikoa:</strong> eskatzen duzun zerbitzua ematea (betearaztea) eta izena ematean ematen duzun baimena.
        <strong> Kontserbazioa:</strong> kontua mantentzen duzun bitartean.
      </p>
      <p>
        <strong>Zure eskubideak:</strong> sarbidea, zuzenketa, ezabaketa, eramangarritasuna, mugaketa eta aurka egitea.
        Zure <strong>kontua ezaba dezakezu</strong> app-etik bertatik (zure datuak ezabatzen ditu), edo hona idatzi:{' '}
        <a href="mailto:admin@fontapp.net">admin@fontapp.net</a>.
        Datuak Babesteko Espainiako Agentziara (AEPD) ere jo dezakezu.
      </p>
      <p>
        <strong>Zure nabigatzailean gordetzen dena:</strong> <strong>ez dugu cookierik erabiltzen</strong>. Zure gailuan
        bertan gordetzen ditugu: <em>saio-tokena</em> (identifikatuta jarraitzeko), zure hobespenak (hizkuntza, gai argia/iluna,
        jada irakurritako oharrak), iritsi zinen kartelaren kodea eta, <strong>estaldurarik gabe</strong> zerbait gehitzen baduzu,
        zure ekarpena eta argazkia tokiko ilara batean, sarea itzuli arte. Han <strong>bilaketen historial labur bat</strong> ere
        gordetzen dugu (aukeratu dituzun azken bilaketak eta bilatzailetik ireki dituzun iturriak); <strong>ez da inoiz zure
        gailutik ateratzen</strong> eta bilatzaileko «Ezabatu» botoiarekin garbi dezakezu. Hori guztia zure gailuan geratzen da eta
        ezaba dezakezu nabigatzailean gunearen datuak hustuz.
      </p>
      <p>
        <strong>Analitika:</strong> <a href="https://www.cloudflare.com/web-analytics/" target="_blank" rel="noreferrer">Cloudflare Web Analytics</a> erabiltzen dugu,
        bisitak modu <strong>agregatuan, cookierik gabe eta zu identifikatu gabe</strong> neurtzen dituena; horregatik ez dizugu
        baimenik eskatzen. Bisita eta botoi-interakzio batzuk ere zenbatzen ditugu fitxa bakoitzeko ausazko identifikatzaile batekin:
        ekintza mota, eguna eta kopurua bakarrik gordetzen ditugu, inoiz ez erabiltzailea, IPa, URLa edo gailua, eta 180 egunera
        identifikatzailea ezabatzen dugu; ondoren, eguneko guztizko anonimoa bakarrik geratzen da. Saio bakoitza lokalean iOS/iPadOS, Android, beste mugikor edo mahaigain gisa eta instalatutako PWA edo nabigatzaile gisa soilik sailkatzen dugu; ez dugu user-agent, modelo, bertsio edo bereizmenik gordetzen. Saioa hasita baduzu, Laguntza edo Aixeta noiz irekitzen duzun, zenbat aldiz eta azken data zure kontuarekin lotzen ditugu, zerbitzua sostengatzeko interesa neurtzeko. Xehetasun hori 180 egunera edo kontua ezabatzean kentzen da. Weba erabiltzen duzun bitartean azken jardueraren ordua ere eguneratzen dugu; administratzaileek bakarrik ikus dezakete kontu bat azken 10 minutuetan aktibo egon den, IP, orri edo gailurik gabe. Ez dugu Google Analytics-ik ez publizitate-sarerik erabiltzen, eta ez dugu daturik saltzen ez lagatzen.
      </p>
      <p><strong>Gure izenean datuak tratatzen dituztenak:</strong></p>
      <ul>
        <li><strong>Fly.io</strong> (zerbitzaria) eta <strong>Neon</strong> (PostgreSQL datu-basea).</li>
        <li><strong>Cloudflare</strong>: weba eta CDNa, analitika agregatua eta argazkien biltegiratzea (R2).</li>
        <li><strong>Resend</strong>: mezu elektronikoen bidalketa (zure helbidea eta mezuaren edukia jasotzen ditu).</li>
        <li><strong>ip-api.com</strong>: izena ematen duzun unean bakarrik, herrialdea eta eskualdea ondorioztatzeko. <strong>Zure IPa jasotzen du</strong>, guk inon gordetzen ez duguna.</li>
      </ul>

      <h2>Datu kartografikoak</h2>
      <p>
        Oinarrizko mapa eta iturrien datuak{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-etik datoz,
        © OpenStreetMap-eko laguntzaileak, <a href="https://opendatacommons.org/licenses/odbl/" target="_blank" rel="noreferrer">ODbL</a> lizentziapean.
        {' '}Iturri batzuk <a href="https://www.icgc.cat" target="_blank" rel="noreferrer">ICGC</a>-tik eta
        ACA-tik datoz, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> lizentziapean.
      </p>
    </>
  )
}
