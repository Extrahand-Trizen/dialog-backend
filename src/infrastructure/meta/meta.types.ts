export type MetaGraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_msg?: string;
    error_user_title?: string;
    fbtrace_id?: string;
    error_data?: {
      messaging_product?: string;
      details?: string;
    };
  };
};

export type MetaWabaResponse = {
  id: string;
  name?: string;
  timezone_id?: string;
  message_template_namespace?: string;
};

export type MetaUnsubscribeResponse = {
  success: boolean;
};

export type MetaPhoneNumberNode = {
  id: string;
  display_phone_number?: string;
  verified_name?: string;
  quality_rating?: string;
  messaging_limit_tier?: string;
  status?: string;
};

export type MetaPhoneNumbersListResponse = {
  data: MetaPhoneNumberNode[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
};

export type MetaPhoneNumberResponse = MetaPhoneNumberNode;

export type MetaResumableUploadStartResponse = {
  id: string;
};

export type MetaResumableUploadCompleteResponse = {
  h: string;
};

export type MetaMessageTemplateComponent = {
  type: string;
  text?: string;
  format?: string;
  buttons?: unknown[];
  example?: unknown;
  cards?: unknown[];
};

export type MetaMessageTemplateNode = {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: MetaMessageTemplateComponent[];
  rejected_reason?: string;
};

export type MetaMessageTemplatesListResponse = {
  data: MetaMessageTemplateNode[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
};

export type MetaSendTemplateParameter = {
  type: 'text';
  text: string;
};

export type MetaSendTemplateComponent = {
  type: 'body' | 'header' | 'button';
  sub_type?: string;
  index?: string;
  parameters?: MetaSendTemplateParameter[];
};

export type MetaSendTemplateRequest = {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: MetaSendTemplateComponent[];
  };
};

export type MetaSendMessageResponse = {
  messaging_product: string;
  contacts?: { input: string; wa_id: string }[];
  messages?: { id: string }[];
};

export type MetaCreateMessageTemplateRequest = {
  name: string;
  language: string;
  category: string;
  components: MetaMessageTemplateComponent[];
};

export type MetaUpdateMessageTemplateRequest = {
  category?: string;
  components: MetaMessageTemplateComponent[];
};

export type MetaUpdateMessageTemplateResponse = {
  id: string;
  status: string;
  category: string;
};

export type MetaCreateMessageTemplateResponse = {
  id: string;
  status: string;
  category: string;
};
