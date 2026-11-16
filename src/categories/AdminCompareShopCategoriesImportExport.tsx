import { useRef, useState, type DragEvent } from 'react';
import type { AdminRequest } from '../bannedItemsApi';
import { Button, ErrorState, Modal, Pill } from '../ui';
import { CategoriesApiError, commitCategoryImport, dryRunCategoryImport, exportCategories, type CategoryImportBlocker, type CategoryImportDryRun, type CategoryImportResult } from './categories-api';

const MAX_FILE_SIZE = 1024 * 1024;
const CONFIRMATION = 'GHI ĐÈ';
type Step = 1 | 2 | 3 | 4;

function actionLabel(action: string): string {
  if (action === 'create') return '+ Tạo mới';
  if (action === 'update') return '~ Cập nhật';
  if (action === 'delete') return '− Xoá';
  return action;
}

function actionTone(action: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  if (action === 'create') return 'ok';
  if (action === 'update') return 'warn';
  if (action === 'delete') return 'bad';
  return 'neutral';
}

function changeDetail(change: CategoryImportDryRun['changes'][number]): string {
  const describe = (value?: Record<string, unknown> | null) => {
    if (!value) return '';
    return [value.name, value.parentSlug ? `cha: ${value.parentSlug}` : null, value.sortOrder !== undefined ? `thứ tự: ${value.sortOrder}` : null].filter(Boolean).join(' · ');
  };
  const before = describe(change.before);
  const after = describe(change.after);
  if (before && after) return `${before} → ${after}`;
  return before || after;
}

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function ChangeList({ changes }: { changes: CategoryImportDryRun['changes'] }) {
  return <div className="category-import-list" aria-label="Thay đổi theo slug">
    {changes.map((change, index) => <div className="category-import-change" key={`${change.slug}-${change.action}-${index}`}>
      <span><code>{change.slug}</code>{changeDetail(change) && <small>{changeDetail(change)}</small>}</span>
      <Pill tone={actionTone(change.action)} size="sm">{actionLabel(change.action)}</Pill>
    </div>)}
    {changes.length === 0 && <p>Không có thay đổi.</p>}
  </div>;
}

export function AdminCompareShopCategoriesImportExport({ requestAdmin, canImport, onApplied }: {
  requestAdmin: AdminRequest;
  canImport: boolean;
  onApplied: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<CategoryImportDryRun | null>(null);
  const [totalAfter, setTotalAfter] = useState<number | null>(null);
  const [result, setResult] = useState<CategoryImportResult | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failureBlockers, setFailureBlockers] = useState<CategoryImportBlocker[]>([]);
  const [exporting, setExporting] = useState(false);

  async function exportJson() {
    setExporting(true);
    setError(null);
    setFailureBlockers([]);
    try {
      const { blob, filename } = await exportCategories(requestAdmin);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể export categories. Vui lòng thử lại.');
    } finally {
      setExporting(false);
    }
  }

  function startImport() {
    setStep(1);
    setFile(null);
    setPreview(null);
    setTotalAfter(null);
    setResult(null);
    setConfirmation('');
    setError(null);
    setFailureBlockers([]);
    setOpen(true);
  }

  async function selectFile(selected: File | undefined) {
    if (!selected) return;
    setError(null);
    setFailureBlockers([]);
    if (!selected.name.toLocaleLowerCase().endsWith('.json')) {
      setFile(null);
      setPreview(null);
      setError('Chỉ hỗ trợ file .json.');
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setPreview(null);
      setError('File vượt quá giới hạn 1 MB.');
      return;
    }
    setFile(selected);
    setPreview(null);
    setTotalAfter(null);
    setBusy(true);
    try {
      try {
        const parsed = JSON.parse(await readFileText(selected)) as { categories?: unknown };
        if (Array.isArray(parsed.categories)) setTotalAfter(parsed.categories.length);
      } catch {
        // The API dry-run returns the useful line and field validation errors.
      }
      setPreview(await dryRunCategoryImport(requestAdmin, selected));
      setStep(2);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể kiểm tra file. Vui lòng thử lại.');
      setStep(2);
    } finally {
      setBusy(false);
    }
  }

  function dropFile(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    void selectFile(event.dataTransfer.files[0]);
  }

  async function commit() {
    if (!file || !preview?.valid || preview.blocked || confirmation !== CONFIRMATION) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await commitCategoryImport(requestAdmin, file, confirmation));
      setStep(4);
      await onApplied();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Import thất bại. Dữ liệu hiện tại không được thay đổi.');
      setFailureBlockers(reason instanceof CategoriesApiError ? reason.blockers : []);
    } finally {
      setBusy(false);
    }
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setError(null);
  }

  const canCommit = Boolean(file && preview?.valid && !preview.blocked && confirmation === CONFIRMATION && !busy);

  return <>
    <div className="category-import-export-actions">
      <Button disabled={exporting} onClick={() => void exportJson()}>{exporting ? 'Đang export…' : '⬇ Export JSON'}</Button>
      {canImport && <Button onClick={startImport}>⬆ Import JSON</Button>}
    </div>
    {error && !open && <div className="category-import-export-error" role="alert">{error}</div>}
    <Modal open={open} onClose={close} title="Import categories" className="category-import-modal" actions={step !== 1 && step !== 4 ? <>
      {step === 2 ? <><Button disabled={busy} onClick={startImport}>← Chọn file khác</Button><Button tone="primary" disabled={!preview?.valid || preview.blocked || busy} onClick={() => { setError(null); setStep(3); }}>Tiếp tục</Button></>
        : step === 3 ? <><Button disabled={busy} onClick={() => { setError(null); setStep(2); }}>← Quay lại</Button><Button tone="danger" disabled={!canCommit} onClick={() => void commit()}>{busy ? 'Đang ghi đè…' : 'Ghi đè toàn bộ'}</Button></>
          : null}
    </> : step === 1 ? <Button disabled={busy} onClick={close}>Huỷ</Button> : <Button tone="primary" onClick={close}>Đóng</Button>}>
      <div className="category-import-steps" aria-label="Các bước import">{['Chọn file', 'Kiểm tra', 'Xác nhận', 'Kết quả'].map((label, index) => <span key={label} aria-current={step === index + 1 ? 'step' : undefined} className={step === index + 1 ? 'is-current' : ''}>{index + 1} {label}</span>)}</div>
      {error && <ErrorState title={error} />}
      {failureBlockers.length > 0 && <section className="category-import-callout bad"><b>Import bị chặn vì category vẫn còn sản phẩm:</b><ul>{failureBlockers.map(blocker => <li key={blocker.slug}>{blocker.name} (<code>{blocker.slug}</code>) — còn {blocker.productCount} sản phẩm</li>)}</ul></section>}
      {step === 1 && <>
        <div className="category-import-drop" onDragOver={event => event.preventDefault()} onDrop={dropFile}>
          <b>Kéo thả file .json vào đây</b>
          <Button size="sm" onClick={() => inputRef.current?.click()}>Chọn file…</Button>
          <small>Tối đa 1 MB · schemaVersion 1</small>
          {busy && <span role="status">Đang kiểm tra file…</span>}
        </div>
        <input ref={inputRef} className="category-import-file-input" type="file" accept=".json,application/json" aria-label="Chọn file JSON" onChange={event => { void selectFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
        <div className="category-import-callout warn">Import sẽ <b>ghi đè toàn bộ</b> category hiện có. Category không có trong file sẽ bị xoá.</div>
      </>}
      {step === 2 && <>
        <div className="category-import-file-name"><b>{file?.name}</b><span>Kiểm tra (dry-run) — chưa ghi gì vào hệ thống</span></div>
        {busy && <p role="status">Đang chạy dry-run…</p>}
        {preview && <>
          {preview.errors.length > 0 && <section className="category-import-callout bad"><b>File không hợp lệ ({preview.errors.length} lỗi)</b><ul>{preview.errors.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul></section>}
          {preview.valid && <>
            <div className="category-import-stats">
              <div className="create"><b>+{preview.summary.create}</b><span>Tạo mới</span></div>
              <div className="update"><b>~{preview.summary.update}</b><span>Cập nhật</span></div>
              <div className="delete"><b>−{preview.summary.delete}</b><span>Sẽ xoá</span></div>
              <div><b>{totalAfter ?? '—'}</b><span>Tổng sau import</span></div>
            </div>
            {preview.blocked && <section className="category-import-callout bad"><b>Import bị chặn:</b> category sẽ bị xoá nhưng còn sản phẩm. Đưa category vào file hoặc chuyển sản phẩm rồi thử lại.<ul>{preview.blockers.map(blocker => <li key={blocker.slug}>{blocker.name} (<code>{blocker.slug}</code>) — còn {blocker.productCount} sản phẩm</li>)}</ul></section>}
            <ChangeList changes={preview.changes} />
          </>}
        </>}
      </>}
      {step === 3 && preview && <>
        <div className="category-import-callout bad"><b>Hành động này ghi đè toàn bộ category và không thể hoàn tác.</b> {preview.summary.create} tạo mới · {preview.summary.update} cập nhật · {preview.summary.delete} xoá.</div>
        <div className="category-import-backup"><Button size="sm" disabled={exporting} onClick={() => void exportJson()}>⬇ Tải backup hiện tại</Button><span>Khuyến nghị: tải bản sao lưu trước khi ghi đè.</span></div>
        <label className="category-import-confirm">Gõ <code>{CONFIRMATION}</code> để xác nhận<input type="text" autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      </>}
      {step === 4 && result && <>
        <div className="category-import-callout success"><b>Import thành công.</b> +{result.summary.create} tạo · ~{result.summary.update} cập nhật · −{result.summary.delete} xoá. Đã ghi Audit Log.</div>
        <ChangeList changes={result.changes} />
      </>}
    </Modal>
  </>;
}
