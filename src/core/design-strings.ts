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
	"look.label": tr("Look", "Aspecto", "Apparence"),
	"look.title": tr("How the page is drawn in this view. Only this view changes; the choice is not saved.", "Cómo se ve la página en esta vista. Solo cambia esta vista; la elección no se guarda.", "La façon dont la page s’affiche dans cette vue. Seule cette vue change ; le choix n’est pas enregistré."),
	"look.paper-light": tr("Paper and petrol: light", "Papel y azul petróleo: claro", "Papier et bleu pétrole : clair"),
	"look.paper-dark": tr("Paper and petrol: dark", "Papel y azul petróleo: oscuro", "Papier et bleu pétrole : sombre"),
	"look.obsidian": tr("Obsidian", "Obsidian", "Obsidian"),
	"crumb.label": tr("Where you are in the booklet", "Dónde estás en el cuadernillo", "Où vous êtes dans le carnet"),
	"status.label": tr("What the view did", "Lo que hizo la vista", "Dernière action"),

	// ---- each level of the booklet
	"level.booklet": tr("Booklet", "Cuadernillo", "Carnet"),
	"level.module": tr("Module", "Módulo", "Module"),
	"level.module-tab": tr("Module tab", "Pestaña de módulo", "Onglet de module"),
	"level.activity": tr("Activity", "Actividad", "Activité"),
	"level.activity-tab": tr("Activity tab", "Pestaña de actividad", "Onglet d’activité"),
	"level.page": tr("Page", "Página", "Page"),
	"level.block": tr("Block", "Bloque", "Bloc"),

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
	"card.records": tr("This is the booklet's kept data. This view never writes it.", "Estos son los datos guardados del cuadernillo. Esta vista nunca los modifica.", "Ce sont les données conservées du carnet. Cette vue ne les écrit jamais."),
	"card.asWritten": tr("This view cannot draw this, so it is shown exactly as it is in the note.", "Esta vista no sabe mostrar esto, así que se ve exactamente como está en la nota.", "Cette vue ne sait pas afficher ceci ; c’est donc montré exactement comme dans la note."),
	"card.untitled": tr("(no title)", "(sin título)", "(sans titre)"),

	// ---- actions on a block
	"act.delete": tr("Delete", "Borrar", "Supprimer"),
	"act.up": tr("Move up", "Mover arriba", "Monter"),
	"act.down": tr("Move down", "Mover abajo", "Descendre"),

	// ---- the pieces' own words, and what an empty part says
	"place.copy": tr("Copy button", "Botón de copiar", "Bouton Copier"),
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

	// ---- the Add tab: the four groups of pieces, and the sample a tile shows
	"cat.structure.title": tr("Structure", "Estructura", "Structure"),
	"cat.questions.title": tr("Questions", "Preguntas", "Questions"),
	"cat.reading.title": tr("Reading aids", "Apoyos de lectura", "Aides à la lecture"),
	"cat.views-data.title": tr("Views and data", "Vistas y datos", "Vues et données"),
	"cat.sample.label": tr("A sample of {name}", "Un ejemplo de {name}", "Exemple : {name}"),

	// ---- how a block is drawn
	"draw.label": tr("How this block looks to a reader, with nothing answered", "Cómo ve este bloque quien lee, sin nada respondido", "Ce bloc tel que le voit la personne qui lit, sans aucune réponse"),

	// ---- the keys: a first letter picks a group, a second a piece, Enter places it
	"keys.refused": tr("{name} cannot go here: {reason}", "{name} no puede ir aquí: {reason}", "{name} ne peut pas être ajouté ici : {reason}"),

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
	"status.failedWhy": tr("Something went wrong: {reason} The page is drawn again from the note as it is.", "Algo salió mal: {reason} La página se muestra de nuevo a partir de la nota tal como está.", "Un problème est survenu : {reason} La page est réaffichée à partir de la note telle qu’elle est."),
	"status.undoFailed": tr("Could not undo: {reason}", "No se pudo deshacer: {reason}", "Impossible d’annuler : {reason}"),
	"status.redoFailed": tr("Could not redo: {reason}", "No se pudo rehacer: {reason}", "Impossible de rétablir : {reason}"),
	"status.nothingUndo": tr("There is nothing to undo in this view.", "No hay nada que deshacer en esta vista.", "Il n’y a rien à annuler dans cette vue."),
	"status.nothingRedo": tr("There is nothing to redo in this view.", "No hay nada que rehacer en esta vista.", "Il n’y a rien à rétablir dans cette vue."),
	"status.undoChanged": tr("The note was changed outside this view since that step, so this view cannot undo it safely. Nothing was changed.", "La nota se cambió fuera de esta vista desde ese paso, así que esta vista no puede deshacerlo de forma segura. No se cambió nada.", "La note a été modifiée en dehors de cette vue depuis cette étape ; cette vue ne peut donc pas l’annuler sans risque. Rien n’a été modifié."),
	"status.redoChanged": tr("The note was changed outside this view since that step, so this view cannot redo it safely. Nothing was changed.", "La nota se cambió fuera de esta vista desde ese paso, así que esta vista no puede rehacerlo de forma segura. No se cambió nada.", "La note a été modifiée en dehors de cette vue depuis cette étape ; cette vue ne peut donc pas la rétablir sans risque. Rien n’a été modifié."),
	// ---- the settings form of an open block: native rows for its id, title, switches and fields
	"form.heading": tr("Settings", "Ajustes", "Réglages"),
	"form.id": tr("Id", "Id", "Identifiant"),
	"form.title": tr("Title", "Título", "Titre"),
	"form.icon": tr("Icon", "Ícono", "Icône"),
	"form.icon.choose": tr("Choose…", "Elegir…", "Choisir…"),
	"form.icon.choose.label": tr("Choose an icon from the list", "Elegir un ícono de la lista", "Choisir une icône dans la liste"),
	"form.stray": tr("Words this kind does not take", "Palabras que este tipo no admite", "Mots que ce type n’accepte pas"),
	"form.stray.remove": tr("Remove", "Quitar", "Retirer"),
	"form.stray.remove.label": tr("Remove the word {word} from this line", "Quitar la palabra {word} de esta línea", "Retirer le mot {word} de cette ligne"),
	"form.refused": tr("Not changed. {reason}", "No se cambió. {reason}", "Non modifié. {reason}"),
	"form.editMarkdown": tr("Edit as Markdown", "Editar como Markdown", "Modifier en Markdown"),

	// ---- the small Markdown editor, in place
	"editor.label": tr("Editing {name}", "Editando {name}", "Modification : {name}"),
	"editor.textarea": tr("Markdown of {name}", "Markdown de {name}", "Markdown pour {name}"),
	"editor.moved": tr("This block is no longer where it was in the note, so what you typed here was not applied. It stays here: copy it out if you need it, then press Esc to close.", "Este bloque ya no está donde estaba en la nota, así que lo que escribiste no se aplicó. Tu texto sigue aquí: cópialo si lo necesitas y luego presiona Esc para cerrar el bloque.", "Ce bloc a changé de place dans la note, donc votre texte n’a pas été appliqué. Il reste affiché ici : copiez-le si vous en avez besoin, puis appuyez sur Échap pour fermer."),
	"editor.status": tr("What the editor did", "Lo que hizo el editor", "Messages de l’éditeur"),
	"editor.busy": tr("Text you typed in the open block could not be applied, so the block stays open with your text in it. Copy it out if you need it, then press Esc again to close the block.", "El texto que escribiste no se pudo aplicar, así que el bloque sigue abierto con tu texto. Cópialo si lo necesitas y luego presiona Esc otra vez para cerrarlo.", "Votre texte n’a pas pu être appliqué, alors le bloc reste ouvert. Copiez-le si vous en avez besoin, puis appuyez de nouveau sur Échap pour fermer le bloc."),
	"editor.detached.name": tr("a block that moved", "un bloque que se movió", "un bloc qui a bougé"),

	// ---- the outline and the lines the reader cannot read, inside the view
	"outline.label": tr("Outline of the booklet", "Esquema del cuadernillo", "Plan du carnet"),
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

	// ---- the canvas: the page, its "+" slots, its cards and its floating bar (Spanish and French from /localize)
	"nav.firstPage": { en: "First page", es: "Primera página", fr: "Première page" },
	"nav.fold": { en: "Fold {name}", es: "Contraer {name}", fr: "Replier {name}" },
	"nav.unfold": { en: "Unfold {name}", es: "Expandir {name}", fr: "Déplier {name}" },
	"tabs.label": { en: "The left column", es: "La columna izquierda", fr: "La colonne de gauche" },
	"tab.outline": { en: "Outline", es: "Esquema", fr: "Plan" },
	"tab.add": { en: "Add", es: "Agregar", fr: "Ajouter" },
	"panel.show": { en: "Show the menu", es: "Mostrar el menú", fr: "Afficher le menu" },
	"panel.close": { en: "Close the menu", es: "Cerrar el menú", fr: "Fermer le menu" },
	"page.edit": { en: "Edit settings", es: "Editar ajustes", fr: "Modifier les réglages" },
	"page.edit.title": { en: "Edit the settings of this part", es: "Editar los ajustes de esta parte", fr: "Modifier les réglages de cet élément" },
	"settings.closed": { en: "The settings of this booklet are its front matter.", es: "Los ajustes de este cuadernillo están en su encabezado.", fr: "Les réglages de ce carnet se trouvent dans son en-tête." },
	"bar.label": { en: "Actions for {name}", es: "Acciones para {name}", fr: "Actions pour {name}" },
	"card.open": { en: "Open", es: "Abrir", fr: "Ouvrir" },
	"card.open.label": { en: "Open {name}", es: "Abrir {name}", fr: "Ouvrir {name}" },
	"card.keeps": { en: "Keeps entries", es: "Guarda entradas", fr: "Conserve des entrées" },
	"card.tabs.one": { en: "{n} tab", es: "{n} pestaña", fr: "{n} onglet" },
	"card.tabs.other": { en: "{n} tabs", es: "{n} pestañas", fr: "{n} onglets" },
	"card.pages.one": { en: "{n} page", es: "{n} página", fr: "{n} page" },
	"card.pages.other": { en: "{n} pages", es: "{n} páginas", fr: "{n} pages" },
	"card.questions.one": { en: "{n} question", es: "{n} pregunta", fr: "{n} question" },
	"card.questions.other": { en: "{n} questions", es: "{n} preguntas", fr: "{n} questions" },
	"draw.later.card": { en: "This is drawn in a later beta.", es: "Esto se mostrará en una versión beta posterior.", fr: "Ceci sera affiché dans une version bêta ultérieure." },
	"draw.remote.card": { en: "This points at media on another site, so it is not drawn here and nothing is fetched.", es: "Esto apunta a contenido multimedia de otro sitio, así que no se muestra aquí y no se descarga nada.", fr: "Ceci renvoie à un média d’un autre site ; il n’est donc pas affiché ici et rien n’est récupéré." },
	"slot.add": { en: "Add here", es: "Agregar aquí", fr: "Ajouter ici" },
	"slot.child.module": { en: "Add a module", es: "Agregar un módulo", fr: "Ajouter un module" },
	"slot.child.activity": { en: "Add an activity", es: "Agregar una actividad", fr: "Ajouter une activité" },
	"slot.child.page": { en: "Add a page", es: "Agregar una página", fr: "Ajouter une page" },
	"slot.child.part": { en: "Add a part", es: "Agregar una parte", fr: "Ajouter un élément" },
	"slot.place": { en: "Place here", es: "Colocar aquí", fr: "Placer ici" },
	"slot.here": { en: "Adding here", es: "Agregando aquí", fr: "Ajout ici" },
	"where.adding": { en: "Adding here", es: "Agregando aquí", fr: "Ajout ici" },
	"where.hint": { en: "Pick a piece, then a lit spot on the page. Or click a plus on the page first.", es: "Elige una parte y luego un punto iluminado de la página. O primero haz clic en un signo + de la página.", fr: "Choisissez un élément, puis un emplacement en surbrillance sur la page. Ou cliquez d’abord sur un signe + de la page." },
	"where.start": { en: "At the start of the page", es: "Al inicio de la página", fr: "Au début de la page" },
	"where.after": { en: "After “{words}”", es: "Después de “{words}”", fr: "Après « {words} »" },
	"where.end": { en: "At the end of the page", es: "Al final de la página", fr: "À la fin de la page" },
	"pal.common": { en: "Common", es: "Frecuentes", fr: "Courants" },
	"pal.off": { en: "{name} cannot go here: {reason}", es: "{name} no puede ir aquí: {reason}", fr: "{name} ne peut pas être ajouté ici : {reason}" },
	"armed.banner": { en: "{name} is picked. Tap a lit spot to place it, or drag the tile there.", es: "Elegiste {name}. Toca un punto iluminado para colocar la parte, o arrastra la ficha hasta allí.", fr: "Vous avez choisi {name}. Touchez un emplacement en surbrillance pour placer l’élément, ou glissez-y la tuile." },
	"armed.back": { en: "Put it back", es: "Devolver", fr: "Remettre en place" },
	"keys.pending": { en: "Keys: {keys}", es: "Teclas: {keys}", fr: "Touches : {keys}" },
	"edit.markdown": { en: "Markdown", es: "Markdown", fr: "Markdown" },
	"editor.elsewhere": { en: "This block is on another page, so its box stands here, above the page you are on.", es: "Este bloque está en otra página, así que su cuadro de edición se muestra aquí, encima de la página en la que estás.", fr: "Ce bloc est sur une autre page, alors sa zone de modification s’affiche ici, au-dessus de la page où vous êtes." },
	"edit.keys": { en: "Each change is applied when you leave the field, as one step of Undo. Esc, or a press on the page outside the block, closes it.", es: "Cada cambio se aplica al salir del campo y cuenta como un paso de Deshacer. Esc, o pulsar la página fuera del bloque, lo cierra.", fr: "Chaque changement s’applique quand vous quittez le champ et peut être annulé séparément. Échap, ou un clic ou un appui en dehors du bloc, le ferme." },
	"edit.desc": { en: "Description (optional)", es: "Descripción (opcional)", fr: "Description (facultative)" },
	"edit.words": { en: "Words", es: "Texto", fr: "Texte" },
	"edit.rest": { en: "The lines under this are edited in the Markdown below.", es: "Las demás líneas se editan en el Markdown que aparece más abajo.", fr: "Les lignes en dessous se modifient dans le Markdown, plus bas." },
	"edit.markdownOnly": { en: "This block is edited as Markdown, below. {reason}", es: "Este bloque se edita como Markdown, más abajo. {reason}", fr: "Ce bloc se modifie dans le Markdown, plus bas. {reason}" },
	"edit.bar": { en: "Move or delete this block", es: "Mover o borrar este bloque", fr: "Déplacer ou supprimer ce bloc" },
	// ---- the formatting bar over a block's words (Markdown markers only) and what is said when one cannot be put in
	"rich.bar": tr("Formatting", "Formato", "Mise en forme"),
	"rich.bold": tr("Bold", "Negrita", "Gras"),
	"rich.italic": tr("Italic", "Cursiva", "Italique"),
	"rich.link": tr("Link", "Enlace", "Lien"),
	"rich.bullets": tr("Bullet list", "Lista con viñetas", "Liste à puces"),
	"rich.no.bullets": tr("A bullet list is for the text of a note or a callout, not for a title or a question’s help text.", "Una lista con viñetas es para el texto de una nota o de un recuadro, no para un título ni para el texto de ayuda de una pregunta.", "Une liste à puces ne s’emploie que dans le texte d’une note ou d’un encadré, pas dans un titre ni dans le texte d’aide d’une question."),
	"rich.no.nothing": tr("Select some words first.", "Primero selecciona algunas palabras.", "Sélectionnez d’abord quelques mots."),
	"rich.no.rule": tr("A line of nothing but marks would be read as a rule. Select some words first.", "Una línea con solo símbolos de formato se interpretaría como una línea separadora. Primero selecciona algunas palabras.", "Une ligne faite uniquement de symboles de mise en forme serait lue comme un trait de séparation. Sélectionnez d’abord quelques mots."),
	"rich.no.block": tr("That would change what the line is (a heading, a list, a quote, a rule or a callout line), so it was not done.", "Eso cambiaría lo que es la línea (un título, una lista, una cita, una línea separadora o una línea de recuadro), así que no se hizo.", "Cela changerait la nature de la ligne (un titre, une liste, une citation, un trait de séparation ou une ligne d’encadré), alors rien n’a été fait."),
	"rich.no.crowded": tr("There are too many asterisks round these words to tell which are marks. Edit them in the Markdown.", "Hay demasiados asteriscos alrededor de estas palabras para saber cuáles son de formato. Edítalos en el Markdown.", "Il y a trop d’astérisques autour de ces mots pour savoir lesquels sont des marques. Modifiez-les dans le Markdown."),
	"rich.no.linkLines": tr("A link is on one line. Select words on a single line.", "Un enlace va en una sola línea. Selecciona palabras de una sola línea.", "Un lien tient sur une seule ligne. Sélectionnez des mots sur une seule ligne."),
	"rich.no.linkBrackets": tr("The selection already has a square bracket in it, so it cannot be made a link.", "La selección ya contiene corchetes, así que no se puede convertir en enlace.", "La sélection contient déjà un crochet, elle ne peut donc pas devenir un lien."),
	"rich.no.linkImage": tr("A link straight after an exclamation mark would be read as an image. Put a space between them.", "Un enlace justo después de un signo de exclamación se leería como una imagen. Deja un espacio entre ambos.", "Un lien juste après un point d’exclamation serait lu comme une image. Laissez un blanc entre les deux."),
	"rich.no.bulletKind": tr("A heading, a numbered item, a rule or a quote cannot also be a bullet.", "Un título, un elemento numerado, una línea separadora o una cita no pueden ser también una viñeta.", "Une ligne de titre, de liste numérotée, de trait de séparation ou de citation ne peut pas devenir une puce."),
	"edit.changed": { en: "The note changed while you were typing here, so this was not applied. Your text stays in the box: copy it out if you need it.", es: "La nota cambió mientras escribías aquí, así que tu texto no se aplicó. Sigue en el cuadro de edición: cópialo si lo necesitas.", fr: "La note a changé pendant que vous écriviez ici, donc votre texte n’a pas été appliqué. Il reste dans la zone de modification : copiez-le si vous en avez besoin." },
	"edit.lost": { en: "This was typed in a block and could not be applied, because the note had changed. It is shown here so it is not lost: {text}", es: "Escribiste esto en un bloque y no se pudo aplicar, porque la nota había cambiado. Se muestra aquí para que no se pierda: {text}", fr: "Vous avez saisi ce texte dans un bloc, mais il n’a pas pu être appliqué, car la note avait changé. Il est affiché ici pour ne pas être perdu : {text}" },
	"form.fm.marker": { en: "This line makes the note a booklet.", es: "Esta línea convierte la nota en un cuadernillo.", fr: "Cette ligne fait de la note un carnet." },
	"form.fm.none": { en: "(none)", es: "(ninguno)", fr: "(aucun)" },
	"form.fm.more": { en: "Other properties", es: "Otras propiedades", fr: "Autres propriétés" },

	// ---- the rows of a choice, a multi, a shared menu and a matrix, in the editor in place
	"rows.options": tr("Options", "Opciones", "Options"),
	"rows.items": tr("Items", "Ítems", "Items"),
	"rows.anchors": tr("Anchors (the number is the answer that is kept)", "Anclas (el número es la respuesta que se guarda)", "Ancres (le numéro est la réponse conservée)"),
	"rows.refused": tr("The rows are not offered for this block, so it is edited in the Markdown below. {reason}", "Las filas no están disponibles para este bloque, así que se edita en el Markdown de abajo. {reason}", "Les lignes ne sont pas disponibles pour ce bloc : la modification se fait dans le Markdown ci-dessous. {reason}"),
	"rows.up": tr("Move up", "Mover arriba", "Monter"),
	"rows.down": tr("Move down", "Mover abajo", "Descendre"),
	"rows.remove": tr("Remove", "Quitar", "Retirer"),
	"rows.option.text": tr("Option {n}: words", "Opción {n}: texto", "Option {n} : texte"),
	"rows.option.correct": tr("Correct answer", "Respuesta correcta", "Bonne réponse"),
	"rows.option.correct.label": tr("Option {n}: correct answer", "Opción {n}: respuesta correcta", "Option {n} : bonne réponse"),
	"rows.option.up": tr("Option {n}: move up", "Opción {n}: mover arriba", "Option {n} : monter"),
	"rows.option.down": tr("Option {n}: move down", "Opción {n}: mover abajo", "Option {n} : descendre"),
	"rows.option.remove": tr("Option {n}: remove", "Opción {n}: quitar", "Option {n} : retirer"),
	"rows.option.add": tr("Add an option", "Agregar una opción", "Ajouter une option"),
	"rows.option.group": tr("Option {n}", "Opción {n}", "Option {n}"),
	"rows.reply.text": tr("Option {n}, reply {m}: words", "Opción {n}, comentario {m}: texto", "Option {n}, commentaire {m} : texte"),
	"rows.reply.remove": tr("Option {n}, reply {m}: remove", "Opción {n}, comentario {m}: quitar", "Option {n}, commentaire {m} : retirer"),
	"rows.reply.add": tr("Add a reply", "Agregar un comentario", "Ajouter un commentaire"),
	"rows.reply.add.label": tr("Option {n}: add a reply", "Opción {n}: agregar un comentario", "Option {n} : ajouter un commentaire"),
	"rows.menu.name": tr("Shared menu", "Menú compartido", "Menu partagé"),
	"rows.menu.desc": tr("Take the options from a list written once and used by several questions.", "Toma las opciones de una lista escrita una sola vez y usada por varias preguntas.", "Réutilisez les options d’une liste écrite une seule fois et utilisée par plusieurs questions."),
	"rows.menu.none": tr("None: the question has its own options", "Ninguno: la pregunta tiene sus propias opciones", "Aucun : la question a ses propres options"),
	"rows.menu.missing": tr("{id} (not found here)", "{id} (no se encuentra aquí)", "{id} (introuvable ici)"),
	"rows.menu.uses": tr("Uses the shared menu {id}.", "Usa el menú compartido {id}.", "Utilise le menu partagé {id}."),
	"rows.menu.lost": tr("The shared menu {id} is not one this question can see, so it is not drawn.", "El menú compartido {id} no está disponible para esta pregunta, así que no se muestra.", "Cette question n’a pas accès au menu partagé {id} : il n’est donc pas affiché."),
	"rows.menu.open": tr("Go to the menu", "Ir al menú", "Aller au menu"),
	"rows.menu.open.label": tr("Open the shared menu {id}", "Abrir el menú compartido {id}", "Ouvrir le menu partagé {id}"),
	"rows.menu.usedby": tr("Used by: {ids}", "Lo usan: {ids}", "Utilisé par : {ids}"),
	"rows.menu.unused": tr("Not used yet", "Todavía sin usar", "Pas encore utilisé"),
	"rows.item.text": tr("Item {n}: words", "Ítem {n}: texto", "Item {n} : texte"),
	"rows.item.up": tr("Item {n}: move up", "Ítem {n}: mover arriba", "Item {n} : monter"),
	"rows.item.down": tr("Item {n}: move down", "Ítem {n}: mover abajo", "Item {n} : descendre"),
	"rows.item.remove": tr("Item {n}: remove", "Ítem {n}: quitar", "Item {n} : retirer"),
	"rows.item.add": tr("Add an item", "Agregar un ítem", "Ajouter un item"),
	"rows.item.group": tr("Item {n}", "Ítem {n}", "Item {n}"),
	"rows.anchor.number": tr("Anchor {n}: number", "Ancla {n}: número", "Ancre {n} : numéro"),
	"rows.anchor.text": tr("Anchor {n}: words", "Ancla {n}: texto", "Ancre {n} : texte"),
	"rows.anchor.up": tr("Anchor {n}: move up", "Ancla {n}: mover arriba", "Ancre {n} : monter"),
	"rows.anchor.down": tr("Anchor {n}: move down", "Ancla {n}: mover abajo", "Ancre {n} : descendre"),
	"rows.anchor.remove": tr("Anchor {n}: remove", "Ancla {n}: quitar", "Ancre {n} : retirer"),
	"rows.anchor.add": tr("Add an anchor", "Agregar un ancla", "Ajouter une ancre"),
	"rows.anchor.group": tr("Anchor {n}", "Ancla {n}", "Ancre {n}"),
	"rows.none": tr("Nothing here yet.", "Todavía no hay nada aquí.", "Rien ici pour l’instant."),

	// ---- stage 3: the settings of the other kinds, a listen's media, a widget's data block
	"setting.long": tr("Big box", "Cuadro de texto grande", "Grande zone de saisie"),
	"setting.min": tr("Smallest number", "Número mínimo", "Nombre minimal"),
	"setting.max": tr("Largest number", "Número máximo", "Nombre maximal"),
	"setting.step": tr("Step between numbers", "Paso entre números", "Écart entre les valeurs"),
	"setting.each": tr("Asked for each pick of", "Preguntar por cada opción de", "Question répétée pour chaque choix de"),
	"setting.earlier": tr("Earlier words offered", "Palabras anteriores disponibles", "Suggestions tirées des réponses précédentes"),
	"setting.left": tr("Seconds left that count as done", "Margen final (segundos)", "Marge de fin (en secondes)"),
	"setting.readonly": tr("Only shown, not answered", "Solo lectura", "Affiché seulement, sans réponse"),
	"setting.describe": tr("Show what each part says", "Mostrar lo que dice cada parte", "Afficher ce que dit chaque partie"),
	"each.none": tr("Nothing: asked once", "Nada: se pregunta una vez", "Aucun : la question n’est posée qu’une fois"),
	"each.kind": tr("{id} ({kind})", "{id} ({kind})", "{id} ({kind})"),
	"each.data": tr("{id} (data block)", "{id} (bloque de datos)", "{id} (bloc de données)"),
	// ---- stage 4: the fold switch, the pickers (tab, parent page, what a copy button copies), the kept entries' switch, and a question's hint and solution
	"fold.switch": tr("Starts folded", "Empieza plegado", "Commence replié"),
	"fold.plus": tr("It is written with a +, so it can fold and starts open. Turning this on writes a - in its place.", "Está escrito con un +, así que se puede plegar y empieza abierto. Al activarlo se escribe un - en su lugar.", "Il est écrit avec un +, donc il peut se replier et commence ouvert. L’activer écrit un - à la place."),
	"setting.tab": tr("Tab", "Pestaña", "Onglet"),
	"setting.parent": tr("Parent page", "Página superior", "Page parente"),
	"pick.titled": tr("{title} ({id})", "{title} ({id})", "{title} ({id})"),
	"tab.none": tr("No tab: the first one", "Sin pestaña: la primera", "Aucun onglet : le premier"),
	"tab.missing": tr("{id} (not a tab of this module, kept as written)", "{id} (no es una pestaña de este módulo; se conserva tal como está)", "{id} (n’est pas un onglet de ce module, conservé tel quel)"),
	"parent.none": tr("No parent: at the top of the tab", "Sin página superior: arriba de la pestaña", "Aucune page parente : en haut de l’onglet"),
	"parent.missing": tr("{id} (not a page of this tab, kept as written)", "{id} (no es una página de esta pestaña; se conserva tal como está)", "{id} (n’est pas une page de cet onglet, conservé tel quel)"),
	"parent.loop": tr("{id} (would make a loop, kept as written)", "{id} (crearía un ciclo; se conserva tal como está)", "{id} (ferait une boucle, conservé tel quel)"),
	"entries.switch": tr("Kept entries start folded (entries:folded)", "Las entradas guardadas empiezan plegadas (entries:folded)", "Les entrées conservées commencent repliées (entries:folded)"),
	"entries.needsRepeat": tr("Only an activity that repeats keeps entries. Turn on Repeat to use this.", "Solo una actividad que se repite guarda entradas. Activa Repetir para usar esto.", "Seule une activité qui se répète conserve des entrées. Activez la répétition pour l’utiliser."),
	"entries.differs": tr("The line says entries:{value}, which the format does not take. It is kept as written until you turn this on.", "La línea dice entries:{value}, que el formato no admite. Se conserva tal como está hasta que actives esto.", "La ligne indique entries:{value}, que le format n’accepte pas. Elle est conservée telle quelle tant que vous n’activez pas ceci."),
	"copy.heading": tr("What it copies, in this order", "Qué copia, en este orden", "Ce qu’il copie, dans cet ordre"),
	"copy.none": tr("This button copies nothing yet. Add a question below.", "Este botón todavía no copia nada. Agrega una pregunta abajo.", "Ce bouton ne copie encore rien. Ajoutez une question ci-dessous."),
	"copy.noQuestions": tr("This activity has no question that a copy button can copy.", "Esta actividad no tiene ninguna pregunta que un botón de copiar pueda copiar.", "Cette activité n’a aucune question qu’un bouton de copie puisse copier."),
	"copy.group": tr("Item {n}", "Ítem {n}", "Élément {n}"),
	"copy.item": tr("Item {n}: what it copies", "Ítem {n}: qué copia", "Élément {n} : ce qu’il copie"),
	"copy.up": tr("Item {n}: move up", "Ítem {n}: mover arriba", "Élément {n} : déplacer vers le haut"),
	"copy.down": tr("Item {n}: move down", "Ítem {n}: mover abajo", "Élément {n} : déplacer vers le bas"),
	"copy.remove": tr("Item {n}: remove", "Ítem {n}: quitar", "Élément {n} : retirer"),
	"copy.add": tr("Add a question to copy…", "Agregar una pregunta para copiar…", "Ajouter une question à copier…"),
	"copy.q": tr("{id}: {title}", "{id}: {title}", "{id} : {title}"),
	"copy.hint": tr("{id}: its hint", "{id}: su pista", "{id} : son indice"),
	"copy.solution": tr("{id}: its solution", "{id}: su solución", "{id} : sa solution"),
	"copy.kept": tr("{item} (kept as written)", "{item} (se conserva tal como está)", "{item} (conservé tel quel)"),
	"copy.kept.empty": tr("(an empty place, kept as written)", "(un lugar vacío; se conserva tal como está)", "(une place vide, conservée telle quelle)"),
	"helps.hint": tr("Hint", "Pista", "Indice"),
	"helps.solution": tr("Solution", "Solución", "Solution"),
	"helps.title": tr("{name}: title", "{name}: título", "{name} : titre"),
	"helps.words": tr("{name}: words", "{name}: texto", "{name} : texte"),
	"helps.fold": tr("{name}: starts folded", "{name}: empieza plegada", "{name} : démarre en position repliée"),
	"helps.remove": tr("Remove", "Quitar", "Retirer"),
	"helps.remove.hint": tr("Remove the hint", "Quitar la pista", "Retirer l’indice"),
	"helps.remove.solution": tr("Remove the solution", "Quitar la solución", "Retirer la solution"),
	"helps.add.hint": tr("Add a hint", "Agregar una pista", "Ajouter un indice"),
	"helps.add.solution": tr("Add a solution", "Agregar una solución", "Ajouter une solution"),
	"helps.placeholder.hint": tr("Words that help before the reader answers.", "Palabras que ayudan antes de que quien lee responda.", "Des mots qui aident avant que la personne réponde."),
	"helps.placeholder.solution": tr("Words that explain after the reader has answered.", "Palabras que explican después de que quien lee haya respondido.", "Des mots qui expliquent une fois que la personne a répondu."),
	"helps.refused": tr("The hint and the solution of this question are edited in the Markdown below. {reason}", "La pista y la solución de esta pregunta se editan en el Markdown de abajo. {reason}", "L’indice et la solution de cette question se modifient dans le Markdown ci-dessous. {reason}"),
	"media.heading": tr("Media", "Multimedia", "Média"),
	"media.address": tr("Media address", "Dirección (URL)", "Adresse du média"),
	"media.name": tr("Name of the media", "Nombre", "Nom du média"),
	"media.add": tr("No media yet. Type its address to add it.", "Todavía no hay contenido multimedia. Escribe su dirección para agregarlo.", "Pas encore de média. Saisissez son adresse pour l’ajouter."),
	"media.link": tr("This is a link, so the person answering can only tick it as done.", "Esto es un enlace, así que quien responde solo puede marcarlo como terminado.", "C’est un lien : la personne qui répond peut seulement le cocher comme terminé."),
	"media.unshown": tr("This block has a media line the controls cannot show, so it is edited in the Markdown below.", "Este bloque tiene una línea multimedia que los controles no pueden mostrar, así que se edita en el Markdown de abajo.", "Ce bloc contient une ligne de média que les commandes ne peuvent pas afficher : modifiez-la dans le Markdown ci-dessous."),
	"widget.heading": tr("Data block", "Bloque de datos", "Bloc de données"),
	"widget.block": tr("Data block it draws", "Bloque de datos que muestra", "Bloc de données affiché"),
	"widget.block.none": tr("Choose a data block", "Elige un bloque de datos", "Choisissez un bloc de données"),
	"widget.block.engine": tr("Drawn by the {engine} engine. Its data is JSON, so it is edited in its own Markdown.", "Lo dibuja el motor {engine}. Sus datos son JSON, así que se editan en su propio Markdown.", "Affiché par le moteur {engine}. Ses données sont en JSON : elles se modifient dans le Markdown du bloc."),
	"widget.block.plain": tr("Its data is JSON, so it is edited in its own Markdown.", "Sus datos son JSON, así que se editan en su propio Markdown.", "Ses données sont en JSON : elles se modifient dans le Markdown du bloc."),
	"widget.block.open": tr("Open the data block", "Abrir el bloque de datos", "Ouvrir le bloc de données"),
	"widget.block.open.label": tr("Open the data block {id}", "Abrir el bloque de datos {id}", "Ouvrir le bloc de données {id}"),
	"widget.block.lost": tr("The data block {id} is not one this widget can see, so it is not drawn.", "El bloque de datos {id} no está disponible aquí, así que no se muestra.", "Le bloc de données {id} n’est pas disponible ici : il n’est donc pas affiché."),

	// ---- stage 4, step 3: a module's notice, a picture, a figure and a citation, as fields
	"notice.heading": tr("About this module", "Acerca de este módulo", "À propos de ce module"),
	"notice.license": tr("License", "Licencia", "Licence"),
	"notice.copyright": tr("Copyright", "Derechos de autor", "Droits d’auteur"),
	"notice.source": tr("Source", "Fuente", "Source"),
	"notice.version": tr("Version", "Versión", "Version"),
	"notice.hint": tr("Leave a field empty to leave it out of the notice. Each one is a single line of text.", "Deja un campo vacío para omitirlo del aviso. Cada uno es una sola línea de texto.", "Laissez un champ vide pour l’omettre de la mention. Chacun tient sur une seule ligne de texte."),
	"notice.sourceNotLink": tr("The reader shows this source as plain words, not as a link, because it does not start with http:// or https://.", "Quien lee verá esta fuente como texto sin formato, no como un enlace, porque no empieza con http:// ni https://.", "La personne qui lit verra cette source comme du texte simple, et non comme un lien, car elle ne commence pas par http:// ni par https://."),
	"notice.kept": tr("Kept as written. These lines are not one of the four, or are not written key: value, so no field changes them:", "Se conservan tal cual. Estas líneas no son una de las cuatro, o no están escritas como clave: valor, así que ningún campo las cambia:", "Conservées telles quelles. Ces lignes ne sont pas l’une des quatre, ou ne sont pas écrites clé: valeur ; aucun champ ne les modifie :"),
	"notice.refused": tr("This notice is edited in the Markdown below. {reason}", "Este aviso se edita en el Markdown de abajo. {reason}", "Cette mention se modifie dans le Markdown ci-dessous. {reason}"),
	"image.heading": tr("Picture", "Imagen", "Image"),
	"image.heading.n": tr("Picture {n}", "Imagen {n}", "Image {n}"),
	"image.note": tr("Only the words and the address are written into the note. Nothing is fetched or uploaded.", "Solo se escriben en la nota el texto y la dirección. No se descarga ni se sube nada.", "Seuls le texte et l’adresse sont écrits dans la note. Rien n’est récupéré ni téléversé."),
	"image.alt": tr("Describe the picture", "Describe la imagen", "Décrivez l’image"),
	"image.alt.empty": tr("Left empty, the picture is decorative: a screen reader says nothing for it.", "Si se deja vacío, la imagen es decorativa: un lector de pantalla no la describe.", "Laissé vide, l’image est décorative : un lecteur d’écran n’en dit rien."),
	"image.alt.none": tr("An Obsidian file embed has no words of its own to describe the picture.", "Una inserción de archivo de Obsidian no tiene texto propio para describir la imagen.", "Une intégration de fichier d’Obsidian n’a pas de texte propre pour décrire l’image."),
	"image.path": tr("Where the picture is", "Dónde está la imagen", "Où se trouve l’image"),
	"image.where": tr("The place is written on line {line}, as [{id}].", "El lugar está escrito en la línea {line}, como [{id}].", "L’emplacement est écrit à la ligne {line}, sous la forme [{id}]."),
	"image.missing": tr("There is no line that says where [{id}] is, so the picture cannot be shown.", "No hay una línea que diga dónde está [{id}], así que la imagen no se puede mostrar.", "Aucune ligne n’indique où se trouve [{id}] : l’image ne peut donc pas être affichée."),
	"image.missing.add": tr("Add the line", "Agregar la línea", "Ajouter la ligne"),
	"image.missing.add.label": tr("Add the line that says where [{id}] is", "Agregar la línea que dice dónde está [{id}]", "Ajouter la ligne qui indique où se trouve [{id}]"),
	"image.shape": tr("Some pictures in these words are written in a shape the fields do not read. They stay as they are, and the Markdown below is how to edit them.", "Algunas imágenes de este texto están escritas de una forma que los campos no leen. Se quedan como están, y se editan en el Markdown de abajo.", "Certaines images de ce texte sont écrites sous une forme que les champs ne lisent pas. Elles restent telles quelles ; on les modifie dans le Markdown ci-dessous."),
	"image.refused": tr("This picture is edited in the Markdown below. {reason}", "Esta imagen se edita en el Markdown de abajo. {reason}", "Cette image se modifie dans le Markdown ci-dessous. {reason}"),
	"figure.heading": tr("Figure", "Figura", "Figure"),
	"figure.heading.n": tr("Figure {n}", "Figura {n}", "Figure {n}"),
	"figure.pick": tr("Diagram shown here", "Diagrama que se muestra aquí", "Schéma affiché ici"),
	"figure.none": tr("No diagram is in reach of this page. A diagram is a mermaid block in the module’s data section, or in the shared one.", "Ningún diagrama está al alcance de esta página. Un diagrama es un bloque mermaid en la sección de datos del módulo, o en la compartida.", "Aucun schéma n’est accessible depuis cette page. Un schéma est un bloc mermaid dans la section de données du module, ou dans la section partagée."),
	"figure.lost": tr("The diagram {id} is not one this page can see, so it is not drawn. It is kept as written until you choose another.", "El diagrama {id} no está al alcance de esta página, así que no se muestra. Se conserva tal como está hasta que elijas otro.", "Le schéma {id} n’est pas accessible depuis cette page : il n’est donc pas affiché. Il est conservé tel quel jusqu’à ce que vous en choisissiez un autre."),
	"figure.where": tr("The diagram’s own text stays in the data section.", "El texto del diagrama se queda en la sección de datos.", "Le texte du schéma reste dans la section de données."),
	"figure.shape": tr("Some figure embeds in these words name a file or say more after the id. They stay as they are, and the Markdown below is how to edit them.", "Algunas inserciones de figura de este texto nombran un archivo o dicen algo más después del id. Se quedan como están, y se editan en el Markdown de abajo.", "Certaines intégrations de figure de ce texte désignent un fichier ou ajoutent du texte après l’identifiant. Elles restent telles quelles ; on les modifie dans le Markdown ci-dessous."),
	"citation.heading": tr("Source for [^{id}]", "Fuente de [^{id}]", "Source de [^{id}]"),
	"citation.title": tr("Source title", "Título de la fuente", "Titre de la source"),
	"citation.detail": tr("Edition or detail", "Edición u otro detalle", "Édition ou autre précision"),
	"citation.page": tr("Page or place", "Página o lugar", "Page ou endroit"),
	"citation.quote": tr("Quote", "Cita", "Citation"),
	"citation.verified": tr("Verified date", "Fecha de verificación", "Date de vérification"),
	"citation.where": tr("Its note is on line {line}.", "Su nota está en la línea {line}.", "Sa note se trouve à la ligne {line}."),
	"citation.where.words": tr("Its note is on line {line}: open that block to edit its words.", "Su nota está en la línea {line}: abre ese bloque para editar su texto.", "Sa note se trouve à la ligne {line} : ouvrez ce bloc pour en modifier le texte."),
	"citation.notPattern": tr("This note is not in the source pattern, so it is edited as words below.", "Esta nota no sigue el patrón de fuente, así que se edita como texto más abajo.", "Cette note n’est pas dans le modèle de source ; elle se modifie donc comme du texte, plus bas."),
	"citation.severalLines": tr("This note runs over more than one line, so it is edited as words below.", "Esta nota ocupa más de una línea, así que se edita como texto más abajo.", "Cette note occupe plus d’une ligne ; elle se modifie donc comme du texte, plus bas."),
	"citation.missing": tr("There is no footnote for [^{id}] in this module, so the mark shows no source.", "No hay una nota al pie para [^{id}] en este módulo, así que la marca no muestra ninguna fuente.", "Il n’y a pas de note pour [^{id}] dans ce module : l’appel de note n’affiche donc aucune source."),
	"citation.missing.add": tr("Add a note", "Agregar una nota", "Ajouter une note"),
	"citation.missing.add.label": tr("Add a note for [^{id}]", "Agregar una nota para [^{id}]", "Ajouter une note pour [^{id}]"),

	"note.notBooklet": tr("This note has no booklet line in its properties, so it is not a booklet yet. You can add front matter below.", "Esta nota no tiene una línea booklet en sus propiedades, así que todavía no es un cuadernillo. Puedes agregar un encabezado abajo.", "Cette note n’a pas de ligne booklet dans ses propriétés, donc ce n’est pas encore un carnet. Vous pouvez ajouter un en-tête ci-dessous."),
} as const satisfies Table;

export type DesignKey = keyof typeof DESIGN_STRINGS;

/** The counted words: each is a `<name>.one` and a `<name>.other`. */
export type PluralKey = "confirm.lines" | "card.tabs" | "card.pages" | "card.questions";

/** One key of the Design view's table, in `lang`. */
export const t = (key: DesignKey, lang: Lang, vars?: Readonly<Record<string, string | number>>): string => say(DESIGN_STRINGS, lang, key, vars);

/** One counted key of the Design view's table (`confirm.lines` is `confirm.lines.one` and `.other`). */
export const tn = (key: PluralKey, n: number, lang: Lang): string => plural(DESIGN_STRINGS, lang, key, n);
