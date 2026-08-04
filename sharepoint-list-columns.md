# Suggested Microsoft List / SharePoint List Columns

Create a Microsoft List or SharePoint List for submitted checklist records.

Suggested list name:

```text
Safety Checklist Submissions
```

Suggested columns:

| Column Name | Type | Purpose |
|---|---|---|
| Title | Single line of text | Use Submission ID |
| SubmissionId | Single line of text | Unique ID from public hub |
| SubmittedAt | Date and time | Submission timestamp |
| CompanyName | Single line of text | Company / Trade Partner |
| CompanyKey | Single line of text | Normalized company grouping key |
| ChecklistTitle | Single line of text | Checklist name |
| ChecklistId | Single line of text | Checklist system ID |
| ChecklistDate | Date and time | Date entered in checklist |
| NegativeFinding | Yes/No | True when negative finding exists |
| CorrectiveAction | Multiple lines of text | Corrective action or prevention feedback |
| ResponsesJson | Multiple lines of text | Checklist responses as JSON |
| FieldsJson | Multiple lines of text | General form fields as JSON |
| PhotoCount | Number | Number of uploaded photos |
| PhotoFolderUrl | Hyperlink | Link to SharePoint folder with photos |
| PdfUrl | Hyperlink | Future PDF link |
| Status | Choice | Submitted, Reviewed, Archived |

## Company values currently used in the public hub

```text
E&K
Flynn
IWR
JE Dunn
Metro Air
PCI Metro
Shaw Electric
Site Rite
Other
```
