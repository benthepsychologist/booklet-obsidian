/*
 * The Design view's words, in one table. English is the source and is always there; Spanish and French have a slot each, filled by
 * /localize from the English (`.localize-state.json` at the repo's root holds the hash of each English string it translated, so a
 * re-run touches only what changed). A key with no Spanish or French is still shown in English (so a half-translated table never
 * shows a hole).
 * Plain TypeScript: nothing here imports Obsidian; the shell passes the language Obsidian is in (`langOf(getLanguage())`).
 *
 * A word that has a count is two keys, `<name>.one` and `<name>.other` (`plural`); French takes 0 and 1 as the singular. A `{name}` in
 * a string is filled from the values handed to `say`. Words that come from the format's own pieces table (a piece's label) and from
 * core's reasons (why a place is refused, what a change touches) are English in their own files and are not in this table.
 */
import { EMPTY_TEXT } from "./design-places";

export type Lang = "en" | "es" | "fr";

export interface StringEntry {
	en: string;
	es?: string;
	fr?: string;
}

export type Table = Readonly<Record<string, StringEntry>>;

/** The language a code names (`es-MX` is Spanish), English when it is none of ours. */
export function langOf(code: string | null | undefined): Lang {
	const c = String(code ?? "").toLowerCase();
	return c === "es" || c.startsWith("es-") || c.startsWith("es_") ? "es" : c === "fr" || c.startsWith("fr-") || c.startsWith("fr_") ? "fr" : "en";
}

/** A string from `table`, in `lang` when it has that slot filled, else in English; `{name}` is replaced from `vars`. An unknown key is its own text. */
export function say(table: Table, lang: Lang, key: string, vars: Readonly<Record<string, string | number>> = {}): string {
	const e = table[key];
	const text = e ? ((lang === "en" ? undefined : e[lang]) ?? e.en) : key;
	return text.replace(/\{(\w+)\}/g, (m, name: string) => (Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m));
}

/** `<key>.one` for one, `<key>.other` for the rest (French: for 0 and 1 too), with `{n}` filled in. */
export function plural(table: Table, lang: Lang, key: string, n: number, vars: Readonly<Record<string, string | number>> = {}): string {
	const one = lang === "fr" ? n === 0 || n === 1 : n === 1;
	return say(table, lang, `${key}.${one ? "one" : "other"}`, { n, ...vars });
}

/** One entry: English (the source), then Spanish and French from /localize. */
const tr = (en: string, es: string, fr: string): StringEntry => ({ en, es, fr });

/** Every key of the Design view, for the shell and for the list a translator is handed. */
export const DESIGN_STRINGS = {
	// ---- the mode buttons (the header of each view) and the view's own name
	"mode.markdown": tr("Show Markdown", "Mostrar Markdown", "Afficher le Markdown"),
	"mode.booklet": tr("Open as booklet", "Abrir como cuadernillo", "Ouvrir en carnet"),
	"mode.design": tr("Open in Design view", "Abrir en la vista de diseño", "Ouvrir dans la vue Conception"),
	"view.name": tr("Design", "Diseño", "Conception"),
	"setting.openIn.name": tr("Open booklets in", "Abrir cuadernillos en", "Ouvrir les carnets dans"),
	"setting.openIn.desc": tr("The view a booklet note opens in. The other views stay one button away in the header of every note.", "La vista en la que se abre una nota de cuadernillo. Las otras vistas siguen disponibles con un botón en la parte superior de cada nota.", "La vue dans laquelle s’ouvre une note de carnet. Les autres vues restent accessibles d’un seul bouton, en haut de chaque note."),
	"setting.openIn.booklet": tr("Booklet view", "Vista de Booklet", "Vue Booklet"),
	"setting.openIn.design": tr("Design view", "Vista de diseño", "Vue Conception"),

	// ---- the toolbar and the breadcrumb
	"toolbar.label": tr("Design view actions", "Acciones de la vista de diseño", "Actions de la vue Conception"),
	"undo": tr("Undo", "Deshacer", "Annuler"),
	"redo": tr("Redo", "Rehacer", "Rétablir"),
	"undo.title": tr("Undo the last change made in this view", "Deshacer el último cambio hecho en esta vista", "Annuler le dernier changement fait dans cette vue"),
	"redo.title": tr("Redo the change that was undone", "Rehacer el cambio que se deshizo", "Rétablir le changement qui a été annulé"),
	"crumb.label": tr("Where you are in the booklet", "Dónde estás en el cuadernillo", "Où vous êtes dans le carnet"),
	"status.label": tr("What the view did", "Lo que hizo la vista", "Dernière action"),

	// ---- each level of the booklet, and what it is in plain words (written once, here)
	"level.booklet": tr("Booklet", "Cuadernillo", "Carnet"),
	"level.module": tr("Module", "Módulo", "Module"),
	"level.module-tab": tr("Module tab", "Pestaña de módulo", "Onglet de module"),
	"level.activity": tr("Activity", "Actividad", "Activité"),
	"level.activity-tab": tr("Activity tab", "Pestaña de actividad", "Onglet d’activité"),
	"level.page": tr("Page", "Página", "Page"),
	"level.block": tr("Block", "Bloque", "Bloc"),
	"what.booklet": tr("The booklet is the whole note. Its opening comes first, then its modules and activities.", "El cuadernillo es toda la nota. Primero va su apertura, luego sus módulos y actividades.", "Le carnet est la note entière. Son ouverture vient en premier, puis ses modules et ses activités."),
	"what.module": tr("A module is a unit of the booklet. It holds activities.", "Un módulo es una unidad del cuadernillo. Contiene actividades.", "Un module est une unité du carnet. Il contient des activités."),
	"what.module-tab": tr("A module tab groups a module's activities on the module's own screen.", "Una pestaña de módulo agrupa las actividades de un módulo en la pantalla propia del módulo.", "Un onglet de module regroupe les activités d’un module sur l’écran propre à ce module."),
	"what.activity": tr("An activity is one thing a reader does. It holds questions, tabs and pages.", "Una actividad es algo que hace quien lee. Contiene preguntas, pestañas y páginas.", "Une activité est ce que fait la personne qui lit. Elle contient des questions, des onglets et des pages."),
	"what.activity-tab": tr("An activity tab is one part of an activity that the reader switches to. It holds pages.", "Una pestaña de actividad es una parte de una actividad entre las que quien lee puede cambiar. Contiene páginas.", "Un onglet d’activité est une partie d’une activité vers laquelle la personne qui lit passe. Il contient des pages."),
	"what.page": tr("A page is one screen of an activity or a tab. It holds questions and words.", "Una página es una pantalla de una actividad o de una pestaña. Contiene preguntas y texto.", "Une page est un écran d’une activité ou d’un onglet. Elle contient des questions et du texte."),
	"what.block": tr("A block is one piece of a page: words, a question, a reading aid, a view or a group.", "Un bloque es una pieza de una página: texto, una pregunta, un apoyo de lectura, una vista o un grupo.", "Un bloc est une partie d’une page : du texte, une question, une aide à la lecture, une vue ou un groupe."),

	// ---- the kinds of block, and what a card says
	"kind.front-matter": tr("Front matter", "Encabezado", "En-tête"),
	"kind.data-section": tr("Data section", "Sección de datos", "Section de données"),
	"kind.records": tr("Records", "Registros", "Enregistrements"),
	"kind.group": tr("Group", "Grupo", "Groupe"),
	"kind.row": tr("Row", "Fila", "Ligne"),
	"kind.question": tr("Question", "Pregunta", "Question"),
	"kind.callout": tr("Reading callout", "Recuadro de lectura", "Encadré de lecture"),
	"kind.notice": tr("Notice", "Aviso", "Remarque"),
	"kind.menu": tr("Menu", "Menú", "Menu"),
	"kind.query": tr("View of data", "Vista de datos", "Vue de données"),
	"kind.fence": tr("Data block", "Bloque de datos", "Bloc de données"),
	"kind.page-break": tr("Page break", "Salto de página", "Saut de page"),
	"kind.prose": tr("Words", "Texto", "Texte"),
	"kind.comment": tr("Comment", "Comentario", "Commentaire"),
	"kind.as-written": tr("As written", "Tal como está", "Tel quel"),
	"card.lines": tr("Its lines in the note", "Sus líneas en la nota", "Ses lignes dans la note"),
	"card.fold": tr("Its opening lines", "Sus primeras líneas", "Ses premières lignes"),
	"card.records": tr("This is the booklet's kept data. This view never writes it.", "Estos son los datos guardados del cuadernillo. Esta vista nunca los modifica.", "Ce sont les données conservées du carnet. Cette vue ne les écrit jamais."),
	"card.asWritten": tr("This view cannot draw this, so it is shown exactly as it is in the note.", "Esta vista no sabe mostrar esto, así que se ve exactamente como está en la nota.", "Cette vue ne sait pas afficher ceci ; c’est donc montré exactement comme dans la note."),
	"card.untitled": tr("(no title)", "(sin título)", "(sans titre)"),

	// ---- actions on a block
	"act.add": tr("+ Add", "+ Agregar", "+ Ajouter"),
	"act.add.label": tr("Add to {name}", "Agregar a {name}", "Ajouter à {name}"),
	"act.delete": tr("Delete", "Borrar", "Supprimer"),
	"act.delete.label": tr("Delete {name}", "Borrar {name}", "Supprimer {name}"),
	"act.up": tr("Move up", "Mover arriba", "Monter"),
	"act.up.label": tr("Move {name} up", "Mover {name} arriba", "Monter {name}"),
	"act.down": tr("Move down", "Mover abajo", "Descendre"),
	"act.down.label": tr("Move {name} down", "Mover {name} abajo", "Descendre {name}"),
	"act.select.label": tr("Select {name}", "Elegir {name}", "Sélectionner {name}"),

	// ---- what a container says it can take
	"add.needs": tr("A {kind} needs another part first: {first}.", "Esta parte ({kind}) necesita antes otra: {first}.", "« {kind} » a d’abord besoin d’un autre élément : {first}."),
	"add.nothing": tr("Nothing can be added here.", "No se puede agregar nada aquí.", "Rien ne peut être ajouté ici."),
	"place.front-matter": tr("Front matter", "Encabezado", "En-tête"),
	"place.theme": tr("Theme", "Tema", "Thème"),
	"place.module": tr("Module", "Módulo", "Module"),
	"place.activity": tr("Activity", "Actividad", "Activité"),
	"place.module-tab": tr("Module tab", "Pestaña de módulo", "Onglet de module"),
	"place.activity-tab": tr("Activity tab", "Pestaña de actividad", "Onglet d’activité"),
	"place.page": tr("Page", "Página", "Page"),
	"place.question": tr("Question", "Pregunta", "Question"),
	"place.copy": tr("Copy button", "Botón de copiar", "Bouton Copier"),
	"place.row": tr("Row", "Fila", "Ligne"),
	"place.group": tr("Group", "Grupo", "Groupe"),
	"place.query": tr("View of data", "Vista de datos", "Vue de données"),
	"place.menu": tr("Menu", "Menú", "Menu"),
	"place.data-block": tr("Data block", "Bloque de datos", "Bloc de données"),
	"place.data-section": tr("Data section", "Sección de datos", "Section de données"),
	"place.notice": tr("Notice", "Aviso", "Remarque"),
	"place.page-break": tr("Page break", "Salto de página", "Saut de page"),
	"place.callout": tr("Reading callout", "Recuadro de lectura", "Encadré de lecture"),
	"place.text": tr("Words", "Texto", "Texte"),
	"piece.words": tr("words", "texto", "texte"),
	"empty.booklet": tr(EMPTY_TEXT["booklet"] ?? "", "Este cuadernillo está vacío. Agrega un módulo o una actividad.", "Ce carnet est vide. Ajoutez un module ou une activité."),
	"empty.module": tr(EMPTY_TEXT["module"] ?? "", "Este módulo está vacío. Agrega una actividad.", "Ce module est vide. Ajoutez une activité."),
	"empty.module-tab": tr(EMPTY_TEXT["module-tab"] ?? "", "Esta pestaña de módulo está vacía. Agrega texto, o agrega `tab:` con su id a una actividad.", "Cet onglet de module n’a pas de texte. Ajoutez du texte, ou ajoutez `tab:` et son identifiant à une activité."),
	"empty.activity": tr(EMPTY_TEXT["activity"] ?? "", "Esta actividad está vacía. Agrega una pregunta, una pestaña o una página.", "Cette activité est vide. Ajoutez une question, un onglet ou une page."),
	"empty.activity-tab": tr(EMPTY_TEXT["activity-tab"] ?? "", "Esta pestaña está vacía. Agrega una pregunta o una página.", "Cet onglet est vide. Ajoutez une question ou une page."),
	"empty.page": tr(EMPTY_TEXT["page"] ?? "", "Esta página está vacía. Agrega una pregunta o texto.", "Cette page est vide. Ajoutez une question ou du texte."),
	"empty.group": tr(EMPTY_TEXT["group"] ?? "", "Este grupo está vacío. Agrega una pregunta o texto.", "Ce groupe est vide. Ajoutez une question ou du texte."),
	"empty.row": tr(EMPTY_TEXT["row"] ?? "", "Esta fila está vacía. Agrega texto o una pregunta.", "Cette ligne est vide. Ajoutez du texte ou une question."),
	"empty.data-section": tr(EMPTY_TEXT["data-section"] ?? "", "Esta sección de datos está vacía. Agrega un bloque de datos.", "Cette section de données est vide. Ajoutez un bloc de données."),

	// ---- the catalogue: the parts a container can take, in four folded groups, each with live samples
	"cat.label": tr("Parts that can be added here", "Partes que se pueden agregar aquí", "Éléments qui peuvent être ajoutés ici"),
	"cat.structure.title": tr("Structure", "Estructura", "Structure"),
	"cat.structure.blurb": tr("The parts a booklet is built of: modules, activities, tabs, pages and rows.", "Las partes de las que se compone un cuadernillo: módulos, actividades, pestañas, páginas y filas.", "Les éléments dont un carnet est fait : modules, activités, onglets, pages et lignes."),
	"cat.questions.title": tr("Questions", "Preguntas", "Questions"),
	"cat.questions.blurb": tr("What a reader answers: choices, text, numbers, scales, dates and matrices.", "Lo que responde quien lee: opciones, texto, números, escalas, fechas y cuadrículas.", "Ce à quoi répond la personne qui lit : choix, texte, nombres, échelles, dates et grilles."),
	"cat.reading.title": tr("Reading aids", "Apoyos de lectura", "Aides à la lecture"),
	"cat.reading.blurb": tr("Things to read: callouts, hints, quotes, citations and words.", "Cosas para leer: recuadros, pistas, citas textuales, referencias y texto.", "Ce qu’on lit : encadrés, indices, citations, références et texte."),
	"cat.views-data.title": tr("Views and data", "Vistas y datos", "Vues et données"),
	"cat.views-data.blurb": tr("Rows and figures a booklet keeps, and the tables, lists, cards, tiles, bars and lines that show them.", "Filas y cifras que guarda un cuadernillo, y las tablas, listas, tarjetas, mosaicos, barras y líneas que las muestran.", "Les lignes et les chiffres qu’un carnet conserve, et les tableaux, listes, cartes, tuiles, barres et courbes qui les affichent."),
	"cat.open.label": tr("{group}: {blurb}", "{group}: {blurb}", "{group} : {blurb}"),
	"cat.keys": tr("Keys: {keys}", "Teclas: {keys}", "Touches : {keys}"),
	"cat.nokeys": tr("No keys", "Sin teclas", "Aucune touche"),
	"cat.add": tr("Add", "Agregar", "Ajouter"),
	"cat.add.label": tr("Add {name}", "Agregar {name}", "Ajouter {name}"),
	"cat.sample.label": tr("A sample of {name}", "Un ejemplo de {name}", "Exemple : {name}"),
	"cat.card.label": tr("The Markdown of {name}", "El Markdown de {name}", "Le Markdown pour {name}"),

	// ---- how a block in the tree is drawn, and why one is only its Markdown
	"draw.label": tr("How this block looks to a reader, with nothing answered", "Cómo ve este bloque quien lee, sin nada respondido", "Ce bloc tel que le voit la personne qui lit, sans aucune réponse"),
	"draw.fold": tr("Its lines in the note", "Sus líneas en la nota", "Ses lignes dans la note"),
	"draw.later": tr("This is shown as its Markdown for now. A later beta draws it.", "Por ahora se muestra como su Markdown. Una beta posterior lo representará.", "Pour l’instant, il est affiché sous forme de Markdown. Une prochaine version bêta saura l’afficher."),
	"draw.remote": tr("This points at media on another site, so it is not drawn here and nothing is fetched. It is shown as its Markdown.", "Esto apunta a contenido multimedia de otro sitio, así que aquí no se muestra y no se carga nada. Se muestra como su Markdown.", "Ceci renvoie à un média sur un autre site ; il n’est donc pas affiché ici et rien n’est récupéré. Il est montré sous forme de Markdown."),

	// ---- the keys: a first letter picks a group, a second a part, Enter adds it
	"keys.title": tr("Add a part by keys", "Agregar una parte por teclas", "Ajout au clavier"),
	"keys.label": tr("Add a part: pick a letter, or type a word to narrow the list", "Agregar una parte: elige una letra, o escribe una palabra para filtrar la lista", "Ajouter un élément : choisissez une lettre, ou tapez un mot pour filtrer la liste"),
	"keys.hint": tr("Press a letter to pick. Type a word to narrow the list. Arrow keys move, Enter adds the highlighted part, Escape closes.", "Presiona una letra para elegir. Escribe una palabra para filtrar la lista. Con las flechas te mueves, Enter agrega la parte resaltada y Esc cierra.", "Appuyez sur une lettre pour choisir. Tapez un mot pour filtrer la liste. Les flèches déplacent la sélection, Entrée ajoute l’élément en surbrillance, Échap ferme."),
	"keys.groups": tr("Pick a group:", "Elige un grupo:", "Choisissez un groupe :"),
	"keys.in": tr("{group}: pick a part.", "{group}: elige una parte.", "{group} : choisissez un élément."),
	"keys.variants": tr("{name}: Enter adds it as it is, or pick a variant.", "{name}: Enter agrega la parte tal cual, o elige una variante.", "{name} : Entrée l’ajoute tel quel, ou choisissez une variante."),
	"keys.filter": tr("Parts that match “{typed}”:", "Partes que coinciden con “{typed}”:", "Éléments qui correspondent à « {typed} » :"),
	"keys.none": tr("Nothing matches “{typed}”. Backspace takes a letter back.", "Nada coincide con “{typed}”. Retroceso borra una letra.", "Rien ne correspond à « {typed} ». Retour arrière retire une lettre."),
	"keys.back": tr("Back", "Atrás", "Retour"),
	"keys.close": tr("Close", "Cerrar", "Fermer"),
	"keys.refused": tr("{name} cannot go here: {reason}", "{name} no puede ir aquí: {reason}", "{name} ne peut pas être ajouté ici : {reason}"),
	"keys.pick.label": tr("Add {name} ({keys})", "Agregar {name} ({keys})", "Ajouter {name} ({keys})"),
	"keys.group.label": tr("{group} ({key})", "{group} ({key})", "{group} ({key})"),
	"keys.disabled": tr("Not here: {reason}", "Aquí no: {reason}", "Impossible ici : {reason}"),
	"keys.bar": tr("Add a part by group", "Agregar una parte por grupo", "Ajouter par groupe"),
	"keys.addPiece": tr("Add part…", "Agregar parte…", "Ajouter un élément…"),
	"keys.addPiece.title": tr("Open the list of parts that can be added here", "Abrir la lista de partes que se pueden agregar aquí", "Ouvrir la liste des éléments qui peuvent être ajoutés ici"),

	// ---- the palette commands (no default keys: a person may bind her own)
	"cmd.addPiece": tr("Design view: add a part…", "Vista de diseño: agregar una parte…", "Vue Conception : ajouter un élément…"),
	"cmd.group": tr("Design view: add from {group}…", "Vista de diseño: agregar de {group}…", "Vue Conception : ajouter depuis {group}…"),

	// ---- the question before a change that touches kept data
	"confirm.title.delete": tr("Delete this {kind}?", "¿Borrar esta parte ({kind})?", "Supprimer cet élément ({kind}) ?"),
	"confirm.title.move": tr("Move this {kind}?", "¿Mover esta parte ({kind})?", "Déplacer cet élément ({kind}) ?"),
	"confirm.title.change": tr("Change this {kind}?", "¿Cambiar esta parte ({kind})?", "Modifier cet élément ({kind}) ?"),
	"confirm.lead.delete": tr("{name} and everything in it will be taken out of the note.", "Se borrarán de la nota: {name} y todo lo que contiene.", "{name} et tout ce qui s’y trouve seront supprimés de la note."),
	"confirm.lead.move": tr("{name} and everything in it will be moved in the note.", "Se moverán en la nota: {name} y todo lo que contiene.", "{name} et tout ce qui s’y trouve seront déplacés dans la note."),
	"confirm.lead.change": tr("{name} will be changed in the note. Only its own lines are rewritten.", "Se cambiará en la nota: {name}. Solo se reescriben sus propias líneas.", "Cela modifie {name} dans la note. Seules ses propres lignes sont réécrites."),
	"confirm.lines.one": tr("{n} line", "{n} línea", "{n} ligne"),
	"confirm.lines.other": tr("{n} lines", "{n} líneas", "{n} lignes"),
	"confirm.touches": tr("Kept data in this booklet will no longer match what it was kept for:", "Los datos guardados de este cuadernillo ya no coincidirán con las partes a las que pertenecen:", "Les données conservées dans ce carnet ne correspondront plus aux éléments pour lesquels elles ont été enregistrées :"),
	"confirm.stays": tr("The kept entries, answers and rows stay in the note's records as they are. This view does not delete or rewrite them.", "Los datos guardados (entradas, respuestas y filas) se quedan en los registros de la nota tal como están. Esta vista no los borra ni los reescribe.", "Les entrées, les réponses et les lignes conservées restent telles quelles dans les enregistrements de la note. Cette vue ne les supprime ni ne les réécrit."),
	"confirm.blind": tr("The reader cannot open this booklet as it is, so this view cannot count what this change touches.", "Booklet no puede abrir este cuadernillo tal como está, así que esta vista no puede indicar qué afecta este cambio.", "La vue Booklet ne peut pas ouvrir ce carnet tel quel ; cette vue ne peut donc pas déterminer ce que ce changement affecte."),
	"confirm.notes": tr("Also:", "También:", "Également :"),
	"confirm.undo": tr("Undo in this view brings the note back as it was. This view keeps its own undo history, so the Markdown view's own undo is not affected.", "Deshacer en esta vista devuelve la nota a como estaba. Esta vista lleva su propio historial de deshacer, así que el historial de deshacer de la vista Markdown no se ve afectado.", "L’annulation dans cette vue remet la note comme elle était. Cette vue conserve son propre historique d’annulation, donc l’annulation propre à la vue Markdown n’est pas affectée."),
	"confirm.yes.delete": tr("Delete", "Borrar", "Supprimer"),
	"confirm.yes.move": tr("Move", "Mover", "Déplacer"),
	"confirm.yes.change": tr("Change", "Cambiar", "Modifier"),
	"confirm.no": tr("Cancel", "Cancelar", "Ne pas modifier"),

	// ---- what the view says after it acts
	"status.added": tr("Added {name}.", "Agregado: {name}.", "Ajouté : {name}."),
	"status.deleted": tr("Deleted {name}.", "Borrado: {name}.", "Supprimé : {name}."),
	"status.moved": tr("Moved {name}.", "Movido: {name}.", "Déplacé : {name}."),
	"status.changed": tr("Changed {name}.", "Cambiado: {name}.", "Modifié : {name}."),
	"status.undone": tr("Undone.", "Deshecho.", "Annulé."),
	"status.redone": tr("Redone.", "Rehecho.", "Rétabli."),
	"status.cancelled": tr("Nothing was changed.", "No se cambió nada.", "Rien n’a été modifié."),
	"status.stale": tr("The note changed after this view drew it, so nothing was written. It is drawn again from the note as it is now.", "La nota cambió después de que esta vista la mostró, así que no se guardó nada. Se vuelve a mostrar a partir de la nota tal como está ahora.", "La note a changé après l’affichage de cette vue, donc rien n’a été écrit. La vue est réaffichée à partir de la note actuelle."),
	"status.failed": tr("The note could not be written. Nothing was changed.", "No se pudo guardar la nota. No se cambió nada.", "La note n’a pas pu être écrite. Rien n’a été modifié."),
	"status.nothingUndo": tr("There is nothing to undo in this view.", "No hay nada que deshacer en esta vista.", "Il n’y a rien à annuler dans cette vue."),
	"status.nothingRedo": tr("There is nothing to redo in this view.", "No hay nada que rehacer en esta vista.", "Il n’y a rien à rétablir dans cette vue."),
	"status.undoChanged": tr("The note was changed outside this view since that step, so this view cannot undo it safely. Nothing was changed.", "La nota se cambió fuera de esta vista desde ese paso, así que esta vista no puede deshacerlo de forma segura. No se cambió nada.", "La note a été modifiée en dehors de cette vue depuis cette étape ; cette vue ne peut donc pas l’annuler sans risque. Rien n’a été modifié."),
	"status.redoChanged": tr("The note was changed outside this view since that step, so this view cannot redo it safely. Nothing was changed.", "La nota se cambió fuera de esta vista desde ese paso, así que esta vista no puede rehacerlo de forma segura. No se cambió nada.", "La note a été modifiée en dehors de cette vue depuis cette étape ; cette vue ne peut donc pas la rétablir sans risque. Rien n’a été modifié."),
	// ---- the form of a selected block: native rows for its id, title, switches and fields
	"form.heading": tr("Settings", "Ajustes", "Réglages"),
	"form.label": tr("Settings of {name}", "Ajustes de {name}", "Réglages pour {name}"),
	"form.id": tr("Id", "Id", "Identifiant"),
	"form.id.desc": tr("Its name in the booklet. Kept answers and rows are stored under it.", "Su nombre en el cuadernillo. Las respuestas y filas se guardan con él.", "Son nom dans le carnet. Les réponses et les lignes conservées sont rangées sous ce nom."),
	"form.title": tr("Title", "Título", "Titre"),
	"form.title.desc": tr("The words after the bracket on its line.", "Las palabras después del corchete en su línea.", "Le texte qui suit le marqueur entre crochets, sur sa ligne."),
	"form.icon": tr("Icon", "Ícono", "Icône"),
	"form.icon.choose": tr("Choose…", "Elegir…", "Choisir…"),
	"form.icon.choose.label": tr("Choose an icon from the list", "Elegir un ícono de la lista", "Choisir une icône dans la liste"),
	"form.stray": tr("Words this kind does not take", "Palabras que este tipo no admite", "Mots que ce type n’accepte pas"),
	"form.stray.remove": tr("Remove", "Quitar", "Retirer"),
	"form.stray.remove.label": tr("Remove the word {word} from this line", "Quitar la palabra {word} de esta línea", "Retirer le mot {word} de cette ligne"),
	"form.none": tr("No settings; edit its Markdown.", "Sin ajustes; edita su Markdown.", "Aucun réglage ; modifiez son Markdown."),
	"form.refused": tr("Not changed. {reason}", "No se cambió. {reason}", "Non modifié. {reason}"),
	"form.editMarkdown": tr("Edit as Markdown", "Editar como Markdown", "Modifier en Markdown"),
	"form.editMarkdown.title": tr("Edit this block's own lines as Markdown, here in the tree", "Editar las líneas propias de este bloque como Markdown, aquí en el esquema", "Modifier les lignes propres à ce bloc en Markdown, ici dans l’arborescence"),

	// ---- the small Markdown editor, in place
	"editor.label": tr("Edit {name} as Markdown", "Editar {name} como Markdown", "Modifier {name} en Markdown"),
	"editor.help": tr("These are only this block's own lines. Save writes them into the note and leaves every other line as it is. Cancel throws your changes away. Esc closes without saving: with changes it keeps them as Unsaved, and a second Esc throws them away.", "Estas son solo las líneas propias de este bloque. Guardar las pone en la nota y deja todas las demás líneas como están. Cancelar descarta tus cambios. Esc cierra sin guardar: con cambios los conserva como «Sin guardar», y un segundo Esc los descarta.", "Ce ne sont que les lignes propres à ce bloc. Le bouton Enregistrer les écrit dans la note et laisse toutes les autres lignes telles quelles. Le bouton Abandonner renonce à vos changements. Échap ferme sans enregistrer : s’il y a des changements, ils sont conservés comme « non enregistrés », et un deuxième Échap les abandonne."),
	"editor.textarea": tr("Markdown of {name}", "Markdown de {name}", "Markdown pour {name}"),
	"editor.save": tr("Save", "Guardar", "Enregistrer"),
	"editor.save.title": tr("Save these lines into the note (Ctrl+Enter or Cmd+Enter)", "Guardar estas líneas en la nota (Ctrl+Enter o Cmd+Enter)", "Enregistrer ces lignes dans la note (Ctrl+Entrée ou Cmd+Entrée)"),
	"editor.cancel": tr("Cancel", "Cancelar", "Abandonner"),
	"editor.cancel.title": tr("Close the editor and throw away what you changed", "Cerrar el editor y descartar lo que cambiaste", "Fermer l’éditeur et abandonner ce que vous avez changé"),
	"editor.unsaved": tr("Unsaved. Your changes are kept here until you save or cancel.", "Sin guardar. Tus cambios se conservan aquí hasta que guardes o canceles.", "Non enregistré. Vos changements sont conservés ici jusqu’à ce que vous enregistriez ou abandonniez."),
	"editor.armed": tr("Unsaved. Esc again throws your changes away; Save writes them.", "Sin guardar. Esc otra vez descarta tus cambios; Guardar los pone en la nota.", "Non enregistré. Un deuxième Échap abandonne vos changements ; le bouton Enregistrer les écrit."),
	"editor.discarded": tr("Your changes were thrown away.", "Tus cambios se descartaron.", "Vos changements ont été abandonnés."),
	"editor.stale": tr("The note changed since this editor opened, so nothing was written. Your text is still in the box.", "La nota cambió desde que se abrió este editor, así que no se guardó nada. Tu texto sigue en el cuadro de texto.", "La note a changé depuis l’ouverture de cet éditeur, donc rien n’a été écrit. Votre texte est toujours dans la zone de saisie."),
	"editor.moved": tr("This block is no longer where it was in the note, so these lines cannot be saved over it. Your text is kept below: copy it out if you need it, then cancel.", "Este bloque ya no está donde estaba en la nota, así que estas líneas no se pueden guardar en él. Tu texto se conserva abajo: cópialo si lo necesitas y luego cancela.", "Ce bloc n’est plus là où il se trouvait dans la note, donc ces lignes ne peuvent pas être enregistrées à sa place. Votre texte est conservé ci-dessous : copiez-le si vous en avez besoin, puis abandonnez."),
	"editor.status": tr("What the editor did", "Lo que hizo el editor", "Messages de l’éditeur"),
	"editor.busy": tr("Another block is open in the Markdown editor with unsaved changes. Save or cancel that one first.", "Otro bloque está abierto en el editor de Markdown con cambios sin guardar. Primero guarda o cancela ese.", "Un autre bloc est ouvert dans l’éditeur Markdown avec des changements non enregistrés. Enregistrez ou abandonnez d’abord celui-là."),
	"editor.detached.name": tr("a block that moved", "un bloque que se movió", "un bloc qui a bougé"),

	// ---- the outline and the lines the reader cannot read, inside the view
	"side.label": tr("The outline, and the lines the reader cannot read", "El esquema y las líneas que Booklet no puede leer", "Le plan, et les lignes que la vue Booklet ne peut pas lire"),
	"outline.title": tr("Outline", "Esquema", "Plan"),
	"outline.label": tr("Outline of the booklet", "Esquema del cuadernillo", "Plan du carnet"),
	"outline.none": tr("Nothing to list yet.", "Todavía no hay nada que mostrar.", "Rien à afficher pour l’instant."),
	"outline.go": tr("{name}. Go to it.", "{name}. Ir allí.", "{name}. Y aller."),
	"problems.title": tr("Lines the reader cannot read", "Líneas que Booklet no puede leer", "Lignes que la vue Booklet ne peut pas lire"),
	"problems.title.count": tr("Lines the reader cannot read ({n})", "Líneas que Booklet no puede leer ({n})", "Lignes que la vue Booklet ne peut pas lire ({n})"),
	"problems.label": tr("Lines the reader cannot read", "Líneas que Booklet no puede leer", "Lignes que la vue Booklet ne peut pas lire"),
	"problems.none": tr("The reader can read every line.", "Booklet puede leer todas las líneas.", "La vue Booklet peut lire toutes les lignes."),
	"problems.line": tr("Line {n}", "Línea {n}", "Ligne {n}"),
	"problems.note": tr("The whole note", "Toda la nota", "La note entière"),
	"problems.go": tr("{where}: {why}. Go to it.", "{where}: {why}. Ir allí.", "{where} : {why}. Y aller."),
	"leftovers.title": tr("Kept data that matches nothing now", "Datos guardados que ya no coinciden con nada", "Données conservées qui ne correspondent plus à rien"),
	"leftovers.title.count": tr("Kept data that matches nothing now ({n})", "Datos guardados que ya no coinciden con nada ({n})", "Données conservées qui ne correspondent plus à rien ({n})"),
	"leftovers.label": tr("Kept data that matches nothing now", "Datos guardados que ya no coinciden con nada", "Données conservées qui ne correspondent plus à rien"),
	"leftovers.none": tr("All kept data matches the booklet.", "Todos los datos guardados coinciden con el cuadernillo.", "Toutes les données conservées correspondent au carnet."),

	"note.notBooklet": tr("This note has no booklet line in its properties, so it is not a booklet yet. You can add front matter below.", "Esta nota no tiene una línea booklet en sus propiedades, así que todavía no es un cuadernillo. Puedes agregar un encabezado abajo.", "Cette note n’a pas de ligne booklet dans ses propriétés, donc ce n’est pas encore un carnet. Vous pouvez ajouter un en-tête ci-dessous."),
} as const satisfies Table;

export type DesignKey = keyof typeof DESIGN_STRINGS;

/** One key of the Design view's table, in `lang`. */
export const t = (key: DesignKey, lang: Lang, vars?: Readonly<Record<string, string | number>>): string => say(DESIGN_STRINGS, lang, key, vars);

/** One counted key of the Design view's table (`confirm.lines` is `confirm.lines.one` and `.other`). */
export const tn = (key: "confirm.lines", n: number, lang: Lang): string => plural(DESIGN_STRINGS, lang, key, n);
