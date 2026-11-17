import { Link } from 'react-router-dom';

/** The logo square and the product name, linking home. */
export default function BrandMark({ linked = true }: { linked?: boolean }) {
  const content = (
    <>
      <span className="size-5 rounded-md bg-primary" aria-hidden />
      <span>Delivery Copilot</span>
    </>
  );
  const cls = 'flex items-center gap-2 font-heading font-bold';
  return linked ? (
    <Link to="/" className={cls}>
      {content}
    </Link>
  ) : (
    <div className={cls}>{content}</div>
  );
}
