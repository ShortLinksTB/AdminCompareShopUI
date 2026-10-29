import { useCallback, useEffect, useState } from 'react';
import {
  approveMatching,
  fetchPendingMatchings,
  reconcileSelections,
  type AdminRequest,
  type MatchingCandidate,
  type PendingMatching,
} from './matching-api';
import './matching.css';

const REFRESH_INTERVAL_MS = 30_000;

function responseText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function MatchingPage({ requestAdmin }: { requestAdmin: AdminRequest }) {
  const [queue, setQueue] = useState<PendingMatching[]>([]);
  const [selections, setSelections] = useState<Record<number, MatchingCandidate>>({});
  const [noSuitable, setNoSuitable] = useState<Record<number, boolean>>({});
  const [approvalErrors, setApprovalErrors] = useState<Record<number, string>>({});
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const refresh = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const matchings = await fetchPendingMatchings(requestAdmin);
      setQueue(matchings);
      setSelections(current => reconcileSelections(current, matchings));
      setNoSuitable(current => Object.fromEntries(Object.entries(current).filter(([id]) => matchings.some(item => item.id === Number(id)))));
      setApprovalErrors(current => Object.fromEntries(Object.entries(current).filter(([id]) => matchings.some(item => item.id === Number(id)))));
    } catch (error) {
      setLoadError(responseText(error, 'Không tải được danh sách chờ duyệt. Vui lòng thử lại.'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [requestAdmin]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(false), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(false), 3500);
    return () => window.clearTimeout(timer);
  }, [success]);

  const chooseCandidate = (matchingId: number, candidate: MatchingCandidate) => {
    setSelections(current => ({ ...current, [matchingId]: candidate }));
    setNoSuitable(current => ({ ...current, [matchingId]: false }));
    setApprovalErrors(current => ({ ...current, [matchingId]: '' }));
  };

  const clearSelection = (matchingId: number) => {
    setSelections(current => {
      const next = { ...current };
      delete next[matchingId];
      return next;
    });
    setNoSuitable(current => ({ ...current, [matchingId]: true }));
    setApprovalErrors(current => ({ ...current, [matchingId]: '' }));
  };

  const approve = async (matchingId: number) => {
    const candidate = selections[matchingId];
    if (!candidate || approvingId !== null) return;
    setApprovingId(matchingId);
    setApprovalErrors(current => ({ ...current, [matchingId]: '' }));
    try {
      await approveMatching(requestAdmin, matchingId, candidate.productId);
      setSuccess(true);
      setQueue(current => current.filter(item => item.id !== matchingId));
      setSelections(current => {
        const next = { ...current };
        delete next[matchingId];
        return next;
      });
      await refresh(false);
    } catch (error) {
      setApprovalErrors(current => ({
        ...current,
        [matchingId]: responseText(error, 'Duyệt thất bại do lỗi mạng. Lựa chọn của bạn vẫn được giữ.'),
      }));
    } finally {
      setApprovingId(null);
    }
  };

  return (
    <section className="matching-page" aria-labelledby="matching-title">
      <header className="matching-page-heading">
        <div>
          <span className="matching-eyebrow">CATALOG</span>
          <h1 id="matching-title">Product Matching</h1>
          <p>Review các listing chưa được ghép vào Product chuẩn.</p>
        </div>
        <div className="matching-heading-actions">
          <span className="matching-queue-count">{loading ? 'Đang tải…' : `${queue.length} mục đang chờ duyệt`}</span>
          <button className="matching-refresh" type="button" onClick={() => void refresh()} disabled={loading}>
            ↻ Làm mới
          </button>
        </div>
      </header>

      {loadError && <div className="matching-banner matching-error" role="alert">
        {loadError}
        <button type="button" onClick={() => void refresh()}>Thử lại</button>
      </div>}

      {success && <div className="matching-toast" role="status" aria-live="polite">✓ Đã duyệt sản phẩm thành công</div>}

      {loading ? <div className="matching-skeletons" role="status" aria-label="Đang tải danh sách">
        <div className="matching-skeleton"><i /><i /><i /></div>
        <div className="matching-skeleton"><i /><i /></div>
      </div> : !loadError && queue.length === 0 ? <div className="matching-empty-queue">
        <strong>Không có mục nào đang chờ duyệt</strong>
        <span>Các mục mới từ nguồn dữ liệu sẽ xuất hiện ở đây.</span>
      </div> : <div className="matching-list">
        {queue.map(item => {
          const selected = selections[item.id];
          const busy = approvingId === item.id;
          const candidates = item.candidates.slice(0, 5);
          return <article className="matching-card" key={item.id} aria-label={`Mục chờ duyệt: ${item.name}`}>
            <div className="matching-card-head">
              <div className="matching-source">
                <strong>{item.name}</strong>
                <span>{item.brand || 'Thương hiệu chưa xác định'}</span>
                <small>Nguồn: {item.dataSourceId === null ? 'Không xác định' : `#${item.dataSourceId}`}
                  {item.externalSku ? ` · SKU nguồn ${item.externalSku}` : ''}</small>
              </div>
              <span className="matching-pending-badge">Đang chờ</span>
            </div>

            {candidates.length === 0 ? <div className="matching-no-candidates">Không tìm thấy gợi ý phù hợp cho mục này.</div> : <fieldset className="matching-candidates">
              <legend>Chọn một sản phẩm gợi ý</legend>
              {candidates.map(candidate => <label
                className={`matching-candidate${selected?.productId === candidate.productId ? ' selected' : ''}`}
                key={candidate.productId}
              >
                <input
                  type="radio"
                  name={`matching-${item.id}`}
                  value={candidate.productId}
                  checked={selected?.productId === candidate.productId}
                  disabled={approvingId !== null}
                  onChange={() => chooseCandidate(item.id, candidate)}
                />
                <span className="matching-candidate-info">
                  <strong>{candidate.name}</strong>
                  <small>{candidate.brand || 'Thương hiệu chưa xác định'} · ID {candidate.productId}</small>
                </span>
                <span className={`matching-score${candidate.similarityScore < 0.6 ? ' low' : ''}`}>
                  {Math.round(candidate.similarityScore * 100)}% tương đồng
                </span>
              </label>)}
            </fieldset>}

            <p className="matching-advisory">Điểm tương đồng chỉ mang tính tham khảo, không phải độ chắc chắn.</p>
            {noSuitable[item.id] && <div className="matching-local-note" role="status">
              Không có sản phẩm phù hợp đã chọn; mục vẫn ở trạng thái chờ. Chưa có thay đổi nào trên máy chủ.
            </div>}
            {approvalErrors[item.id] && <div className="matching-banner matching-error" role="alert">
              {approvalErrors[item.id]}
              <button type="button" onClick={() => void approve(item.id)} disabled={busy || approvingId !== null}>Thử lại</button>
            </div>}

            <footer className="matching-card-foot">
              <span className="matching-action-hint">{busy ? 'Đang gửi yêu cầu duyệt…' : selected ? 'Kiểm tra lựa chọn trước khi duyệt.' : 'Chọn một ứng viên để kích hoạt nút Duyệt.'}</span>
              <div className="matching-actions">
                {candidates.length > 0 && <button
                  className="matching-secondary"
                  type="button"
                  disabled={approvingId !== null}
                  onClick={() => clearSelection(item.id)}
                >Không có sản phẩm phù hợp</button>}
                <button
                  className="matching-primary"
                  type="button"
                  disabled={!selected || approvingId !== null}
                  onClick={() => void approve(item.id)}
                >{busy ? <><span className="matching-spinner" aria-hidden="true" /> Đang duyệt…</> : 'Duyệt'}</button>
              </div>
            </footer>
          </article>;
        })}
      </div>}
    </section>
  );
}
