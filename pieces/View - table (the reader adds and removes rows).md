> [!activity|new-list repeat] A list the reader keeps

The reader adds, edits and removes rows; each change is kept as an entry.

```booklet data
{ "fields": { "title": { "label": "Title", "edit": "text" }, "note": { "label": "Note", "edit": "long" } },
  "idFormat": "{field:title}",
  "rows": [] }
```
^new-data

```booklet query
from: new-data
as: table
add
delete
empty: Nothing here yet. Add the first one.
```
