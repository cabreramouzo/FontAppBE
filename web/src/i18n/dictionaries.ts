// Diccionarios de traducción (sin dependencias). Catalán es el idioma primario
// y sirve de respaldo si falta una clave en otro idioma.

export type Lang = 'ca' | 'es'

export const LANGS: { code: Lang; label: string }[] = [
  { code: 'ca', label: 'Català' },
  { code: 'es', label: 'Español' },
]

type Dict = Record<string, string>

const ca: Dict = {
  // Navegación / layout
  'nav.hello': 'Hola, {user}',
  'nav.logout': 'Surt',
  'nav.enter': 'Entra',
  'footer.legal': 'Legal i privacitat',
  'footer.dataPrefix': 'Dades ©',

  // Mapa
  'map.searchPlaceholder': '🔎 Cerca una font…',
  'map.near': '📍 A prop meu',
  'map.onlyWater': '💧 Només amb aigua',
  'map.includeNonPotable': '🚱 Inclou no potables',
  'map.includeNonPotableTitle': 'Mode emergència: inclou fonts marcades com a no potables',
  'map.addFont': '➕ Afegeix font',
  'map.tapToPlace': 'Toca el mapa per situar la font',
  'map.cancel': 'cancel·la',
  'map.geoUnavailable': 'Geolocalització no disponible',
  'map.geoFailed': 'No s\'ha pogut obtenir la teva ubicació',
  'map.nearbyTitle': 'A prop teu',
  'map.loading': 'Carregant…',
  'map.nearbyEmpty': 'No hi ha fonts a prop.',

  // Formulario nueva fuente
  'newFont.title': 'Nova font',
  'newFont.name': 'Nom',
  'newFont.descriptionOpt': 'Descripció (opcional)',
  'form.create': 'Crea',
  'form.saving': 'Desant…',
  'form.save': 'Desa',
  'form.cancel': 'Cancel·la',

  // Detalle
  'detail.backMap': '← Mapa',
  'detail.edit': 'Edita',
  'detail.delete': 'Esborra',
  'detail.type': 'Tipus:',
  'detail.drinkability': 'Potabilitat:',
  'detail.unknownType': '— desconegut —',
  'detail.unknownDrink': '— desconeguda —',
  'detail.description': 'Descripció',
  'detail.lastUpdate': 'Última actualització:',
  'detail.stale': '⚠️ Sense actualitzar {when} — l\'estat pot haver canviat.',
  'detail.statusReviews': 'Estat i ressenyes',
  'detail.beFirst': 'Encara no hi ha actualitzacions. Sigues el primer a informar de l\'estat!',
  'detail.loginToUpdate': 'per actualitzar l\'estat.',
  'detail.previous': 'Anteriors',
  'detail.incidents': 'Incidències ({n})',
  'detail.noIncidents': 'Sense incidències reportades.',
  'detail.loading': 'Carregant…',
  'detail.confirmDeleteFont': 'Esborrar aquesta font?',
  'detail.confirmDeleteIncident': 'Esborrar aquesta incidència?',

  // Confirmación "sigue igual"
  'confirm.keepSame': 'Segueix igual',
  'confirm.confirmed': 'Confirmat',
  'confirm.titleActive': 'Ja has confirmat que segueix igual (toca per desfer)',
  'confirm.titleInactive': 'Confirma que l\'estat segueix igual',

  // Formulario de actualización / reseña
  'update.status': 'Estat:',
  'update.rating': 'Valoració:',
  'update.howNow': 'Com està la font ara?',
  'update.publish': 'Publica l\'actualització',
  'update.sending': 'Enviant…',
  'review.anon': 'anònim',
  'review.confirmDelete': 'Esborrar aquesta ressenya?',

  // Selector de imagen
  'image.add': '📷 Afegeix foto',
  'image.remove': 'Treu la foto',
  'image.previewAlt': 'Vista prèvia',

  // Login
  'login.enter': 'Entra',
  'login.createAccount': 'Crea un compte',
  'login.name': 'Nom',
  'login.username': 'Usuari (mín. 3)',
  'login.password': 'Contrasenya (mín. 8)',
  'login.register': 'Registra\'m',
  'login.noAccount': 'No tens compte? ',
  'login.haveAccount': 'Ja tens compte? ',
  'login.signup': 'Registra\'t',

  // Estado del agua
  'status.flowing': 'Surt aigua',
  'status.trickle': 'Poca aigua',
  'status.dry': 'Seca',
  'status.unknown': 'Es desconeix',

  // Tipo de fuente
  'source.tap': 'Font / aixeta',
  'source.spring': 'Deu (aigua natural)',
  'source.well': 'Pou',
  'source.fountain': 'Font ornamental',
  'source.other': 'Altre',

  // Potabilidad
  'drink.yes': 'Potable',
  'drink.no': 'No potable',
  'drink.conditional': 'Potable amb condicions',

  // Tiempo relativo
  'time.moment': 'fa un moment',
  'time.min': 'fa {n} min',
  'time.hour': 'fa {n} h',
  'time.yesterday': 'ahir',
  'time.days': 'fa {n} dies',

  // Popup del mapa
  'popup.updated': 'Actualitzat {when}',
  'popup.detail': 'Veure detall →',
  'nearby.goAria': 'Veure detall de {name}',

  // Idioma
  'lang.label': 'Idioma',
}

const es: Dict = {
  'nav.hello': 'Hola, {user}',
  'nav.logout': 'Salir',
  'nav.enter': 'Entrar',
  'footer.legal': 'Legal y privacidad',
  'footer.dataPrefix': 'Datos ©',

  'map.searchPlaceholder': '🔎 Buscar fuente…',
  'map.near': '📍 Cerca de mí',
  'map.onlyWater': '💧 Solo con agua',
  'map.includeNonPotable': '🚱 Incluir no potables',
  'map.includeNonPotableTitle': 'Modo emergencia: incluye fuentes marcadas como no potables',
  'map.addFont': '➕ Añadir fuente',
  'map.tapToPlace': 'Toca el mapa para situar la fuente',
  'map.cancel': 'cancelar',
  'map.geoUnavailable': 'Geolocalización no disponible',
  'map.geoFailed': 'No se pudo obtener tu ubicación',
  'map.nearbyTitle': 'Cerca de ti',
  'map.loading': 'Cargando…',
  'map.nearbyEmpty': 'Sin fuentes cerca.',

  'newFont.title': 'Nueva fuente',
  'newFont.name': 'Nombre',
  'newFont.descriptionOpt': 'Descripción (opcional)',
  'form.create': 'Crear',
  'form.saving': 'Guardando…',
  'form.save': 'Guardar',
  'form.cancel': 'Cancelar',

  'detail.backMap': '← Mapa',
  'detail.edit': 'Editar',
  'detail.delete': 'Borrar',
  'detail.type': 'Tipo:',
  'detail.drinkability': 'Potabilidad:',
  'detail.unknownType': '— desconocido —',
  'detail.unknownDrink': '— desconocida —',
  'detail.description': 'Descripción',
  'detail.lastUpdate': 'Última actualización:',
  'detail.stale': '⚠️ Sin actualizar {when} — el estado puede haber cambiado.',
  'detail.statusReviews': 'Estado y reseñas',
  'detail.beFirst': 'Aún no hay actualizaciones. ¡Sé el primero en informar del estado!',
  'detail.loginToUpdate': 'para actualizar el estado.',
  'detail.previous': 'Anteriores',
  'detail.incidents': 'Incidencias ({n})',
  'detail.noIncidents': 'Sin incidencias reportadas.',
  'detail.loading': 'Cargando…',
  'detail.confirmDeleteFont': '¿Borrar esta fuente?',
  'detail.confirmDeleteIncident': '¿Borrar esta incidencia?',

  'confirm.keepSame': 'Sigue igual',
  'confirm.confirmed': 'Confirmado',
  'confirm.titleActive': 'Ya confirmaste que sigue igual (toca para deshacer)',
  'confirm.titleInactive': 'Confirma que el estado sigue igual',

  'update.status': 'Estado:',
  'update.rating': 'Valoración:',
  'update.howNow': '¿Cómo está la fuente ahora?',
  'update.publish': 'Publicar actualización',
  'update.sending': 'Enviando…',
  'review.anon': 'anónimo',
  'review.confirmDelete': '¿Borrar esta reseña?',

  'image.add': '📷 Añadir foto',
  'image.remove': 'Quitar foto',
  'image.previewAlt': 'Vista previa',

  'login.enter': 'Entrar',
  'login.createAccount': 'Crear cuenta',
  'login.name': 'Nombre',
  'login.username': 'Usuario (mín. 3)',
  'login.password': 'Contraseña (mín. 8)',
  'login.register': 'Registrarme',
  'login.noAccount': '¿No tienes cuenta? ',
  'login.haveAccount': '¿Ya tienes cuenta? ',
  'login.signup': 'Regístrate',

  'status.flowing': 'Sale agua',
  'status.trickle': 'Poca agua',
  'status.dry': 'Seca',
  'status.unknown': 'Se desconoce',

  'source.tap': 'Fuente / grifo',
  'source.spring': 'Manantial',
  'source.well': 'Pozo',
  'source.fountain': 'Ornamental',
  'source.other': 'Otro',

  'drink.yes': 'Potable',
  'drink.no': 'No potable',
  'drink.conditional': 'Potable con condiciones',

  'time.moment': 'hace un momento',
  'time.min': 'hace {n} min',
  'time.hour': 'hace {n} h',
  'time.yesterday': 'ayer',
  'time.days': 'hace {n} días',

  'popup.updated': 'Actualizado {when}',
  'popup.detail': 'Ver detalle →',
  'nearby.goAria': 'Ver detalle de {name}',

  'lang.label': 'Idioma',
}

export const dictionaries: Record<Lang, Dict> = { ca, es }
