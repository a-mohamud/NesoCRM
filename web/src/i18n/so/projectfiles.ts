import type { Catalog } from '../registry';

/** Somali (Soomaali, Beta) – projectfiles. Southern spelling, Kenya conventions. */
export default {
  Dateien: "Faylasha",
  "{n} Dateien": { one: "{n} fayl", other: "{n} fayl" },
  "Gelöscht": "Waa la tirtiray",
  Herunterladen: "Soo dejiso",
  "Löschen": "Tirtir",
  "„{path}“ endgültig löschen?": "Ma tirtirtaa “{path}” gebi ahaanba?",
  "Noch keine Dateien. Claude legt hier Anweisungen und Wissensdateien eines Claude-Projekts oder Dateien aus einem Repo ab (MCP: ghl_import_claude_project, ghl_upload_files).": "Weli fayl ma jiro. Claude wuxuu halkan ku kaydiyaa tilmaamaha iyo faylasha aqoonta ee mashruuc Claude ah ama faylal ka yimid kayd (repository) (MCP: ghl_import_claude_project, ghl_upload_files).",
} satisfies Catalog;
