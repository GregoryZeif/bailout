import { useT } from '../i18n';
import { Modal } from './common';

export function HelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  return (
    <Modal title={t('help.title')} onClose={onClose}>
      <ol className="help-list">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <li key={i}>{t(`help.${i}`)}</li>)}
      </ol>
    </Modal>
  );
}
