// Admin page for decision records (PRD 10.4). UI Kit components only.

import React, { useEffect, useState } from "react";
import ForgeReconciler, {
  Button,
  DynamicTable,
  ErrorMessage,
  Heading,
  HelperMessage,
  Inline,
  Label,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  RequiredAsterisk,
  SectionMessage,
  Spinner,
  Stack,
  Text,
  TextArea,
  Textfield,
} from "@forge/react";
import { invoke } from "@forge/bridge";
import type { AdminResponse, DecisionForm } from "../../admin/api-types";
import type { DecisionRecord } from "../../core/types";
import type { DecisionField } from "../../core/validate";

type FieldErrors = Partial<Record<DecisionField, string>>;

// The form that is open: a new decision record (no id) or an edit.
type Editor = { id?: string; form: DecisionForm };

const EMPTY_FORM: DecisionForm = { title: "", statement: "", terms: "", paths: "", sourceUrl: "" };

const REQUEST_FAILED = "The request failed. Check your connection, then try again.";

// Calls a resolver function. It never rejects: a failed request gives { ok: false }, so the
// page can always show an error and recover. invoke can return the body inside
// { body, metadata } when metadata is requested; this page does not request it, but handle both.
async function call<T>(name: string, payload?: Record<string, string>): Promise<AdminResponse<T>> {
  try {
    const response = await invoke<AdminResponse<T>>(name, payload);
    return "body" in response ? response.body : response;
  } catch (error: unknown) {
    console.error(`Request ${name} failed.`, error);
    return { ok: false, reason: REQUEST_FAILED };
  }
}

function formFor(record: DecisionRecord): DecisionForm {
  return {
    title: record.title,
    statement: record.statement,
    terms: record.terms.join(", "),
    paths: record.paths.join(", "),
    sourceUrl: record.sourceUrl ?? "",
  };
}

const App = (): React.JSX.Element => {
  const [records, setRecords] = useState<DecisionRecord[] | undefined>(undefined);
  const [pageError, setPageError] = useState<string | undefined>(undefined);
  const [editor, setEditor] = useState<Editor | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [retiring, setRetiring] = useState<DecisionRecord | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const load = async (): Promise<void> => {
    const result = await call<DecisionRecord[]>("listDecisions");
    if (result.ok) {
      setRecords(result.value);
      setPageError(undefined);
    } else {
      setRecords([]);
      setPageError(result.reason);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openEditor = (record?: DecisionRecord): void => {
    setEditor(record === undefined ? { form: EMPTY_FORM } : { id: record.id, form: formFor(record) });
    setFieldErrors({});
    setFormError(undefined);
  };

  const setField = (field: keyof DecisionForm, value: string): void => {
    setEditor((current) => (current === undefined ? current : { ...current, form: { ...current.form, [field]: value } }));
  };

  const save = async (): Promise<void> => {
    if (editor === undefined) {
      return;
    }
    setBusy(true);
    let result: AdminResponse<DecisionRecord>;
    try {
      result =
        editor.id === undefined
          ? await call<DecisionRecord>("createDecision", editor.form)
          : await call<DecisionRecord>("updateDecision", { id: editor.id, ...editor.form });
    } finally {
      setBusy(false);
    }
    if (result.ok) {
      setEditor(undefined);
      await load();
      return;
    }
    setFieldErrors(result.fieldErrors ?? {});
    setFormError(result.reason);
  };

  const retire = async (): Promise<void> => {
    if (retiring === undefined) {
      return;
    }
    setBusy(true);
    let result: AdminResponse<DecisionRecord>;
    try {
      result = await call<DecisionRecord>("retireDecision", { id: retiring.id });
    } finally {
      setBusy(false);
    }
    setRetiring(undefined);
    if (!result.ok) {
      // Do not reload: a reload clears the message, and the record did not change.
      setPageError(result.reason);
      return;
    }
    await load();
  };

  const field = (
    name: keyof DecisionForm,
    label: string,
    options: { required?: boolean; multiline?: boolean; helper?: string } = {},
  ): React.JSX.Element => {
    const id = `decision-${name}`;
    const value = editor?.form[name] ?? "";
    return (
      <Stack space="space.050">
        <Label labelFor={id}>
          {label}
          {options.required === true ? <RequiredAsterisk /> : null}
        </Label>
        {options.multiline === true ? (
          <TextArea id={id} name={name} value={value} onChange={(event) => setField(name, event.target.value)} />
        ) : (
          <Textfield id={id} name={name} value={value} onChange={(event) => setField(name, event.target.value)} />
        )}
        {options.helper !== undefined ? <HelperMessage>{options.helper}</HelperMessage> : null}
        {fieldErrors[name] !== undefined ? <ErrorMessage>{fieldErrors[name]}</ErrorMessage> : null}
      </Stack>
    );
  };

  const head = {
    cells: [
      { key: "id", content: "ID" },
      { key: "title", content: "Title" },
      { key: "status", content: "Status" },
      { key: "version", content: "Version" },
      { key: "terms", content: "Terms" },
      { key: "paths", content: "Paths" },
      { key: "updated", content: "Updated" },
      { key: "actions", content: "Actions" },
    ],
  };

  const rows = (records ?? []).map((record) => ({
    key: record.id,
    cells: [
      { key: "id", content: record.id },
      { key: "title", content: record.title },
      {
        key: "status",
        content: (
          <Lozenge appearance={record.status === "active" ? "success" : "default"}>
            {record.status === "active" ? "Active" : "Retired"}
          </Lozenge>
        ),
      },
      { key: "version", content: String(record.version) },
      { key: "terms", content: record.terms.join(", ") },
      { key: "paths", content: record.paths.join(", ") },
      { key: "updated", content: record.updatedAt.slice(0, 16).replace("T", " ") },
      {
        key: "actions",
        content:
          record.status === "active" ? (
            <Inline space="space.100">
              <Button appearance="subtle" onClick={() => openEditor(record)}>
                Edit
              </Button>
              <Button appearance="subtle" onClick={() => setRetiring(record)}>
                Retire
              </Button>
            </Inline>
          ) : (
            ""
          ),
      },
    ],
  }));

  return (
    <Stack space="space.200">
      <Inline spread="space-between" alignBlock="center">
        <Heading size="medium">Decision records</Heading>
        <Button appearance="primary" onClick={() => openEditor()}>
          Create decision record
        </Button>
      </Inline>
      <Text>Coding agents check their plans against the active decision records.</Text>
      {pageError !== undefined ? <SectionMessage appearance="error">{pageError}</SectionMessage> : null}
      {records === undefined ? (
        <Spinner label="Loading decision records" />
      ) : (
        <DynamicTable head={head} rows={rows} emptyView={<Text>There are no decision records.</Text>} />
      )}

      <ModalTransition>
        {editor !== undefined ? (
          <Modal onClose={() => setEditor(undefined)}>
            <ModalHeader>
              <ModalTitle>{editor.id === undefined ? "Create decision record" : `Edit ${editor.id}`}</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Stack space="space.150">
                {formError !== undefined ? <SectionMessage appearance="error">{formError}</SectionMessage> : null}
                {field("title", "Title", { required: true, helper: "1 to 80 characters." })}
                {field("statement", "Statement", { required: true, multiline: true, helper: "1 to 500 characters. Agents see this text." })}
                {field("terms", "Terms", { helper: "Comma-separated, for example: redis, ioredis. Include all names for the subject." })}
                {field("paths", "Paths", { helper: "Comma-separated folder or file paths, relative to the repository root, for example: services/billing." })}
                {field("sourceUrl", "Source link", { helper: "Optional. Must start with https://." })}
              </Stack>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setEditor(undefined)}>
                Cancel
              </Button>
              <Button appearance="primary" isDisabled={busy} onClick={() => void save()}>
                Save
              </Button>
            </ModalFooter>
          </Modal>
        ) : null}
        {retiring !== undefined ? (
          <Modal onClose={() => setRetiring(undefined)}>
            <ModalHeader>
              <ModalTitle appearance="warning">{`Retire ${retiring.id}?`}</ModalTitle>
            </ModalHeader>
            <ModalBody>
              <Text>
                Agents will no longer get conflicts from this decision record. You cannot make it active again.
              </Text>
            </ModalBody>
            <ModalFooter>
              <Button appearance="subtle" onClick={() => setRetiring(undefined)}>
                Cancel
              </Button>
              <Button appearance="warning" isDisabled={busy} onClick={() => void retire()}>
                Retire
              </Button>
            </ModalFooter>
          </Modal>
        ) : null}
      </ModalTransition>
    </Stack>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
