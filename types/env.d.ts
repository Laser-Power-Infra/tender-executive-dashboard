// Typed process.env. Keep in sync with .env.example.
// Required vars are typed `string`; optional / feature-specific vars are `string | undefined`.
declare namespace NodeJS {
  interface ProcessEnv {
    // Core
    DATABASE_URL: string;
    ENVIRONMENT?: "PROD" | (string & {});
    EXTERNAL_API_KEY: string;
    FILE_CRYPTO_KEY: string;
    FILE_CRYPTO_IV: string;
    AUTOMATION_VERSION: "v1" | "v2";
    RABBITMQ_URL?: string;
    TENDER_AUTOMATION_PARSING_CLIENT_ID: string;
    TENDER_AUTOMATION_AUTOMATION_CLIENT_ID: string;
    TENDER_AUTOMATION_SYNC_CLIENT_ID: string;
    TENDER_AGENT_INTELLIGENCE_CLIENT_ID: string;
    TENDER_AGENT_RELEVANCE_CLIENT_ID: string;
    TENDER_AGENT_FEEDBACK_CLIENT_ID: string;
    TENDER_AGENT_INGESTION_CLIENT_ID: string;
    CHROME_PATH?: string;

    // Google service account
    GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
    GOOGLE_CLIENT_EMAIL?: string;
    GOOGLE_PRIVATE_KEY?: string;
    GDRIVE_CLIENT_EMAIL?: string;
    GDRIVE_PRIVATE_KEY?: string;
    GOOGLE_SPREADSHEET_ID?: string;

    // Smartsheet
    SMARTSHEET_API_TOKEN?: string;
    SMARTSHEET_SHEET_ID?: string;
    LC_SMARTSHEET_ID?: string;
    SALES_ENQUIRY_ITEM_LIST_ERP_ID?: string;

    // Network file paths
    INDEXER_NETWORK_PATH?: string;
    COSTING_FILE_NETWORK_PATH?: string;
    SUPPLY_NETWORK_PATH?: string;
    CONDUTOR_PATH?: string;
    OLD_FILES?: string;
    TYPE_TEST_FILES_PATH?: string;
    OLD_RA_EXCEL_PATH?: string;

    // n8n webhooks
    N8N_WEBHOOK_URL?: string;
    N8N_WEBHOOK_URL_TEST?: string;
    N8N_NOTIFICATION_WEBHOOK_URL?: string;
    N8N_EMD_WEBHOOK_URL?: string;
    N8N_RA_WEBHOOK_URL?: string;
    REQUISITION_EMAIL_N8N_WEBHOOK_URL?: string;
    N8N_CERTIFICATE_EMAIL_WEBHOOK_URL?: string;
    N8N_CERTIFICATE_WEBHOOK_URL?: string;

    // Misc
    BOM_API_URL?: string;
    BOM_API_KEY?: string;
    MONITOR_ALERT_EMAIL?: string;
  }
}
