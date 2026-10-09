import Card from '../../components/Card';
import CsvButton from '../../components/CsvButton';
import ReportTable from '../../components/ReportTable';
import { downloadCsv } from '../../utils/csv';
import { hourColumns } from './columns';
import MasPageFrame from './components/MasPageFrame';
import VarianceLegend from './components/VarianceLegend';
import { useMas } from './MasContext';
import type { HourRow } from './types';

const shiftKey = (r: HourRow) => r.date + r.shift;

export default function HourReportPage() {
  const { data, csvName } = useMas();
  return (
    <MasPageFrame title="Hour-wise report" subtitle="Induction against target for each hour of each shift">
      <Card title="Hour-wise report" icon="fa-clock" bodyClassName="p-0"
            tools={<CsvButton disabled={!data} onClick={() => data && downloadCsv(csvName('hour'), hourColumns, data.hour)} />}
            footer={<VarianceLegend />}>
        <ReportTable columns={hourColumns} rows={data?.hour ?? []} rowKey={(r) => r.date + r.shift + r.hour}
                     rowClassName={(r, i, rows) => (i > 0 && shiftKey(rows[i - 1]) !== shiftKey(r) ? 'newshift' : undefined)}
                     emptyText="No scans for these filters." />
      </Card>
    </MasPageFrame>
  );
}
