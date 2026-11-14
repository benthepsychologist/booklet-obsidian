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
	"status.nothingUndo": tr("There is nothing to undo in this view.", "No hay nada que deshacer en esta vista.", "Il n’y a rien à annuler dans cette vue."),
	"status.nothingRedo": tr("There is nothing to redo in this view.", "No hay nada que rehacer en esta vista.", "Il n’y a rien à rétablir dans cette vue."),
	"status.undoChanged": tr("The note was changed outside this view since that step, so this view cannot undo it safely. Nothing was changed.", "La nota se cambió fuera de esta vista desde ese paso, así que esta vista no puede deshacerlo de forma segura. No se cambió nada.", "La note a été modifiée en dehors de cette vue depuis cette étape ; cette vue ne peut donc pas l’annuler sans risque. Rien n’a été modifié."),
	"status.redoChanged": tr("The note was changed outside this view since that step, so this view cannot redo it safely. Nothing was changed.", "La nota se cambió fuera de esta vista desde ese paso, así que esta vista no puede rehacerlo de forma segura. No se cambió nada.", "La note a été modifiée en dehors de cette vue depuis cette étape ; cette vue ne peut donc pas la rétablir sans risque. Rien n’a été modifié."),
	// ---- the settings form of an open block: native rows for its id, title, switches and fields
	"form.heading": tr("Settings", "Ajustes", "Réglages"),
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
	"form.refused": tr("Not changed. {reason}", "No se cambió. {reason}", "Non modifié. {reason}"),
	"form.editMarkdown": tr("Edit as Markdown", "Editar como Markdown", "Modifier en Markdown"),

	// ---- the small Markdown editor, in place
	"editor.label": tr("Edit {name} as Markdown", "Editar {name} como Markdown", "Modifier {name} en Markdown"),
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
	"edit.heading": { en: "Editing: {kind}", es: "Editando: {kind}", fr: "Modification : {kind}" },
	"edit.preview": { en: "As the reader sees it", es: "Como lo ve quien lee", fr: "Tel que le voit la personne qui lit" },
	"edit.markdown": { en: "Markdown", es: "Markdown", fr: "Markdown" },
	"edit.mark": { en: "Unsaved changes", es: "Cambios sin guardar", fr: "Changements non enregistrés" },
	"edit.hint": { en: "Ctrl+Enter saves. Esc twice discards.", es: "Ctrl+Enter guarda. Presionar Esc dos veces descarta.", fr: "Ctrl+Entrée enregistre. Appuyer deux fois sur Échap abandonne." },
	"editor.elsewhere": { en: "This block is on another page. Your draft stays here until you save or cancel.", es: "Este bloque está en otra página. Tu borrador se conserva aquí hasta que guardes o canceles.", fr: "Ce bloc est sur une autre page. Votre brouillon est conservé ici jusqu’à ce que vous enregistriez ou abandonniez." },
	"form.fm.marker": { en: "This line makes the note a booklet.", es: "Esta línea convierte la nota en un cuadernillo.", fr: "Cette ligne fait de la note un carnet." },
	"form.fm.none": { en: "(none)", es: "(ninguno)", fr: "(aucun)" },
	"form.fm.more": { en: "Other properties", es: "Otras propiedades", fr: "Autres propriétés" },

	"note.notBooklet": tr("This note has no booklet line in its properties, so it is not a booklet yet. You can add front matter below.", "Esta nota no tiene una línea booklet en sus propiedades, así que todavía no es un cuadernillo. Puedes agregar un encabezado abajo.", "Cette note n’a pas de ligne booklet dans ses propriétés, donc ce n’est pas encore un carnet. Vous pouvez ajouter un en-tête ci-dessous."),
} as const satisfies Table;

export type DesignKey = keyof typeof DESIGN_STRINGS;

/** The counted words: each is a `<name>.one` and a `<name>.other`. */
export type PluralKey = "confirm.lines" | "card.tabs" | "card.pages" | "card.questions";

/** One key of the Design view's table, in `lang`. */
export const t = (key: DesignKey, lang: Lang, vars?: Readonly<Record<string, string | number>>): string => say(DESIGN_STRINGS, lang, key, vars);

/** One counted key of the Design view's table (`confirm.lines` is `confirm.lines.one` and `.other`). */
export const tn = (key: PluralKey, n: number, lang: Lang): string => plural(DESIGN_STRINGS, lang, key, n);
