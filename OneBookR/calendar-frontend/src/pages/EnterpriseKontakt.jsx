import React from 'react';
import BokaDemo from './BokaDemo.jsx';

// Enterprise-kontakt = samma boknings-/kalenderflöde som "Boka demo", men med
// rubrik om att diskutera en Enterprise-modell och två extra formulärfält
// (antal anställda + antal säten). Delar all logik via variant-propen.
export default function EnterpriseKontakt() {
  return <BokaDemo variant="enterprise" />;
}
