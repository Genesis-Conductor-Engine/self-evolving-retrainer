import { fetchJson } from '../lib/http.mjs';

export function createOnchainGraderPort(config) {
  return {
    async probe({ section, summary }) {
      if (!config.gcpBridgeUrl) {
        return {
          s_onchain: null,
          eta_thermo: null,
          source: 'disabled',
        };
      }
      try {
        const { data } = await fetchJson(`${config.gcpBridgeUrl.replace(/\/$/, '')}/v1/thermo_probe`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.thirdwebSecretKey ? { Authorization: `Bearer ${config.thirdwebSecretKey}` } : {}),
          },
          body: JSON.stringify({
            section_id: section.section_id,
            section_family: section.section_family,
            summary,
          }),
        }, 10000);
        return {
          s_onchain: Number.isFinite(Number(data?.s_onchain)) ? Number(data.s_onchain) : null,
          eta_thermo: Number.isFinite(Number(data?.eta_thermo)) ? Number(data.eta_thermo) : null,
          source: 'gcp_bridge',
        };
      } catch {
        return {
          s_onchain: null,
          eta_thermo: null,
          source: 'unavailable',
        };
      }
    },
  };
}
