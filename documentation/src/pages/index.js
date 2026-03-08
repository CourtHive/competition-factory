import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import useBaseUrl from '@docusaurus/useBaseUrl';
import styles from './styles.module.css';
import Link from '@docusaurus/Link';
import Layout from '@theme/Layout';
import React from 'react';

const features = [
  {
    title: 'Standards Based',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="40" height="40" rx="6" stroke="currentColor" strokeWidth="2.5" />
        <path d="M14 24h20M24 14v20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      </svg>
    ),
    description:
      'Built on the Tennis Open Data Standards (TODS) co-developed with the International Tennis Federation, extended to support a wide range of competitions via CODES.',
  },
  {
    title: 'Proven in Production',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 38V16l16-10 16 10v22L24 48 8 38z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M8 16l16 10 16-10M24 26v22" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>
    ),
    description:
      'Built on years of experience running thousands of events for governing bodies worldwide. Powers tournament management for the USTA and the Intercollegiate Tennis Association.',
    link: { label: 'TMX platform', url: 'https://courthive.github.io/TMX/#/' },
  },
  {
    title: 'Rigorously Tested',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 24l6 6 14-14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2.5" />
      </svg>
    ),
    description:
      'Written in 100% TypeScript with a Test Driven Development process. Over 5,000 tests across 600+ test files cover more than 96% of the codebase.',
  },
];

const stats = [
  { number: '6,000+', label: 'Tests' },
  { number: '96%', label: 'Coverage' },
  { number: '100%', label: 'TypeScript' },
  { number: '0', label: 'Runtime Deps' },
];

function HeroLogo() {
  const lightSrc = useBaseUrl('img/CourtHive.svg');
  const darkSrc = useBaseUrl('img/CourtHive-dark.svg');
  return (
    <>
      <img className={`${styles.heroLogo} ${styles.heroLogoLight}`} src={lightSrc} alt="" aria-hidden="true" />
      <img className={`${styles.heroLogo} ${styles.heroLogoDark}`} src={darkSrc} alt="" aria-hidden="true" />
    </>
  );
}

function Feature({ title, icon, description, link }) {
  return (
    <div className={styles.featureCard}>
      <div className={styles.featureIcon} style={{ color: 'var(--ifm-color-primary)' }}>
        {icon}
      </div>
      <h3 className={styles.featureTitle}>{title}</h3>
      <p className={styles.featureDescription}>{description}</p>
      {link && (
        <a className={styles.featureLink} href={link.url} target="_blank" rel="noopener noreferrer">
          {link.label} &rarr;
        </a>
      )}
    </div>
  );
}

function Stat({ number, label }) {
  return (
    <div>
      <div className={styles.statNumber}>{number}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout title={siteConfig.title} description="Competition Management Components">
      <header className={styles.heroBanner}>
        <div className={styles.heroContent}>
          <HeroLogo />
          <h1 className={styles.heroTitle}>{siteConfig.title}</h1>
          <p className={styles.heroTagline}>{siteConfig.tagline}</p>
          <div className={styles.buttons}>
            <Link className={styles.ctaButton} to={useBaseUrl('docs/')}>
              Get Started
            </Link>
            <a
              className={`${styles.ctaButton} ${styles.ctaSecondary}`}
              href="https://github.com/CourtHive/competition-factory"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </header>

      <main>
        <section className={styles.features}>
          <div className={styles.featureGrid}>
            {features.map((props, idx) => (
              <Feature key={idx} {...props} />
            ))}
          </div>
        </section>

        <section className={styles.stats}>
          <div className={styles.statsGrid}>
            {stats.map((props, idx) => (
              <Stat key={idx} {...props} />
            ))}
          </div>
        </section>
      </main>
    </Layout>
  );
}
