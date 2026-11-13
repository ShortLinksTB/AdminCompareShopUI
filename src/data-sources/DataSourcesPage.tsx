import { Button, Card, PageHeader, Pill } from '../ui';
import './data-sources.css';

const sources = [
  { name: 'CellphoneS API', type: 'API', shop: 'CellphoneS', schedule: 'Every 15 min', credential: 'Connected', status: 'Active' as const, last: '2 phút trước' },
  { name: 'Shopee Affiliate Feed', type: 'Affiliate feed', shop: 'Shopee Mall', schedule: 'Every 1 hour', credential: 'Connected', status: 'Active' as const, last: '8 phút trước' },
  { name: 'TechMart Products', type: 'CSV', shop: 'TechMart', schedule: 'Manual upload', credential: 'Expired', status: 'Failed' as const, last: '3 giờ trước' },
];

export function DataSourcesPage() {
  return <>
    <PageHeader
      eyebrow="AFFILIATE & DATA"
      title="Data Sources"
      description="API, affiliate feed và CSV sources đang cung cấp catalog cho GiaTot."
      actions={<Button tone="primary">+ Add source</Button>}
    />
    <section className="data-source-grid" aria-label="Data Sources">
      {sources.map(source => <Card className="data-source-card" key={source.name} aria-label={source.name}>
        <div className="data-source-card-head">
          <span className="data-source-type">{source.type}</span>
          <Pill tone={source.status === 'Active' ? 'ok' : 'bad'}>{source.status}</Pill>
        </div>
        <h2>{source.name}</h2>
        <p className="data-source-shop">{source.shop}</p>
        <dl className="data-source-facts">
          <div><dt>Schedule</dt><dd>{source.schedule}</dd></div>
          <div><dt>Credential</dt><dd className={source.credential === 'Expired' ? 'data-source-credential-expired' : 'data-source-credential-connected'}>{source.credential}</dd></div>
          <div><dt>Last sync</dt><dd>{source.last}</dd></div>
        </dl>
        <div className="data-source-actions">
          <Button size="sm">Configure</Button>
          <Button size="sm" tone="primary">Run sync</Button>
        </div>
      </Card>)}
    </section>
  </>;
}
