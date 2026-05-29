'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';

const MONO = 'var(--font-dm-mono, "DM Mono", monospace)';

export default function LoadingScreen() {
  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#fff', flexDirection: 'column', gap: '16px' }}>
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Image src="/logo-tie.png" alt="loading" width={48} height={48} style={{ objectFit: 'contain', display: 'block' }} />
      </motion.div>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        {[0, 1, 2].map(i => (
          <motion.span
            key={i}
            animate={{ opacity: [0.2, 1, 0.2] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.2 }}
            style={{ fontFamily: MONO, fontSize: '20px', color: '#c60078', lineHeight: 1 }}
          >
            .
          </motion.span>
        ))}
      </div>
    </div>
  );
}
