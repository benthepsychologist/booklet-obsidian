```booklet data
{ "fields": { "label": "Label", "value": "Value", "note": "Note" },
  "rows": [
    { "label": "First row", "value": 3, "note": "A few words" },
    { "label": "Second row", "value": 5, "note": "A few words" },
    { "label": "Third row", "value": 2, "note": "A few words" } ] }
```
^new-data

```booklet query
from: new-data
as: line
fields: value
```
