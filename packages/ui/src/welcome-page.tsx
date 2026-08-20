import teamImg from '../../assets/team.png';

export type WelcomePageProps = {
  audience: 'organization' | 'platform';
};

const content = {
  organization: {
    eyebrow: 'Organization workspace',
    description:
      'A focused home for the people, time, and payroll work that keeps your organization moving.',
    label: 'Workspace application',
  },
  platform: {
    eyebrow: 'Platform control room',
    description:
      'The operating surface for organizations, federation clients, and the systems behind Smarteam.',
    label: 'Super Admin application',
  },
} as const;

export function WelcomePage({ audience }: WelcomePageProps) {
  const copy = content[audience];
  const imageSrc = typeof teamImg === 'string' ? teamImg : teamImg.src;

  return (
    <main className="welcome-shell">
      <header className="welcome-nav">
        <a className="wordmark" href="/" aria-label="Smarteam home">
          <span className="wordmark__dot" aria-hidden="true" />
          smarteam
        </a>
        <span className="nav-caption">{copy.label}</span>
      </header>

      <section className="welcome-grid" aria-labelledby="welcome-title">
        <div className="welcome-copy">
          <p className="eyebrow">
            <span className="eyebrow__line" aria-hidden="true" />
            {copy.eyebrow}
          </p>
          <h1 id="welcome-title">
            People work,
            <br />
            <em>made clearer.</em>
          </h1>
          <p className="welcome-description">{copy.description}</p>
          <div className="coming-soon" role="status">
            <span className="coming-soon__pulse" aria-hidden="true" />
            <span>Coming soon</span>
          </div>
        </div>

        <div className="welcome-figure" aria-hidden="true">
          <img src={imageSrc} alt="Smarteam Team" className="welcome-figure__image" />
        </div>
      </section>
    </main>
  );
}
