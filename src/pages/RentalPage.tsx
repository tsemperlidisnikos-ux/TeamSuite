import { PageHeader } from '../components/ui/PageHeader';
import { FacilityRentalPanel } from '../components/FacilityRentalPanel';

export function RentalPage() {
  return (
    <div className="stack-lg prints-page">
      <PageHeader
        title="Ενοικίαση"
        subtitle="Διαθεσιμότητα γηπέδων, κρατήσεις γραμματείας και δημόσιο link."
      />
      <div className="page-panel">
        <FacilityRentalPanel />
      </div>
    </div>
  );
}
