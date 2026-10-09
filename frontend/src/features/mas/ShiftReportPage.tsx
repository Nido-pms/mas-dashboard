import Card from '../../components/Card';
import CsvButton from '../../components/CsvButton';
import ReportTable from '../../components/ReportTable';
import { downloadCsv } from '../../utils/csv';
import { shiftColumns } from './columns';
import MasPageFrame from './components/MasPageFrame';
import VarianceLegend from './components/VarianceLegend';
import { useMas } from './MasContext';

export default function ShiftReportPage() {
  const { data, csvName } = useMas();
  return (
    <MasPageFrame title="Shift-wise report" subtitle="Induction against target for each shift">
      <Card title="Shift-wise report" icon="fa-business-time" bodyClassName="p-0"
            tools={<CsvButton disabled={!data} onClick={() => data && downloadCsv(csvName('shift'), shiftColumns, data.shift)} />}
            footer={<VarianceLegend />}>
        <ReportTable columns={shiftColumns} rows={data?.shift ?? []} rowKey={(r) => r.date + r.shift}
                     emptyText="No scans for these filters." />
      </Card>
    </MasPageFrame>
  );
}
