import { useState } from 'react';
import { Button, Card, PageHeader, Select, Switch } from '../ui';

const initialQualitySettings = {
  outlierDetection: true,
  autoMatchingSuggestions: true,
  notifyFailedSync: true,
};

const qualityControls = [
  { key: 'outlierDetection', label: 'Outlier detection', description: 'Flag offer có giá lệch khỏi median.' },
  { key: 'autoMatchingSuggestions', label: 'Auto matching suggestions', description: 'Tạo đề xuất match tự động.' },
  { key: 'notifyFailedSync', label: 'Notify failed sync', description: 'Gửi cảnh báo cho Super Admin.' },
] as const;

export function SettingsPage() {
  const [qualitySettings, setQualitySettings] = useState(initialQualitySettings);

  const updateQualitySetting = (key: keyof typeof initialQualitySettings, checked: boolean) => {
    setQualitySettings(current => ({ ...current, [key]: checked }));
  };

  return <>
    <PageHeader eyebrow="SYSTEM" title="Settings" description="Cấu hình hiển thị, dữ liệu và hành vi hệ thống."
      actions={<Button tone="primary" type="button">Save settings</Button>} />
    <div className="studio-card-grid">
      <Card className="studio-card-content" aria-labelledby="settings-general-title">
        <h2 id="settings-general-title">General</h2>
        <div className="studio-form-stack">
          <label className="studio-form-field">Product display currency
            <Select aria-label="Product display currency" defaultValue="VND">
              <option value="VND">VND — Vietnamese đồng</option>
              <option value="USD">USD — US dollar</option>
            </Select>
          </label>
          <label className="studio-form-field">Default timezone
            <Select aria-label="Default timezone" defaultValue="Asia/Ho_Chi_Minh">
              <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh</option>
              <option value="UTC">UTC</option>
            </Select>
          </label>
          <label className="studio-form-field">Stale offer threshold
            <Select aria-label="Stale offer threshold" defaultValue="24">
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
              <option value="48">48 hours</option>
            </Select>
          </label>
        </div>
      </Card>
      <Card className="studio-card-content" aria-labelledby="settings-quality-title">
        <h2 id="settings-quality-title">Data quality</h2>
        <div className="studio-switch-list">
          {qualityControls.map(({ key, label, description }) => <div className="studio-switch-row" key={key}>
            <span><b>{label}</b><small>{description}</small></span>
            <Switch label={label} checked={qualitySettings[key]} onChange={checked => updateQualitySetting(key, checked)} />
          </div>)}
        </div>
      </Card>
    </div>
  </>;
}
