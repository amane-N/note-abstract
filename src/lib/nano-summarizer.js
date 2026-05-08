'use strict';

(() => {
  const ns = (globalThis.__noteAbstract = globalThis.__noteAbstract || {});

  const checkAvailability = async () => {
    try {
      if (typeof self === 'undefined' || !('Summarizer' in self)) {
        return { status: 'unsupported' };
      }
      const raw = await self.Summarizer.availability();
      const value = typeof raw === 'string' ? raw : raw && raw.available;
      return { status: value || 'unknown' };
    } catch (err) {
      return {
        status: 'error',
        reason: err && err.message ? err.message : String(err),
      };
    }
  };

  const summarize = async (text, options = {}) => {
    const {
      type = 'tldr',
      length = 'short',
      format = 'plain-text',
      onProgress,
    } = options;

    if (!text || !text.trim()) {
      throw new Error('SUMMARIZER_EMPTY_INPUT');
    }

    const availability = await checkAvailability();
    switch (availability.status) {
      case 'unsupported':
        throw new Error('SUMMARIZER_UNSUPPORTED');
      case 'no':
        throw new Error('SUMMARIZER_DEVICE_INELIGIBLE');
      case 'error':
        throw new Error(`SUMMARIZER_AVAIL_ERROR:${availability.reason || 'unknown'}`);
      default:
        break;
    }

    const createOptions = { type, length, format };
    if (availability.status === 'after-download' && typeof onProgress === 'function') {
      createOptions.monitor = (monitor) => {
        monitor.addEventListener('downloadprogress', (event) => {
          try {
            onProgress(event.loaded ?? 0, event.total ?? 1);
          } catch (_) {
            // Progress callback failures must never abort summarization.
          }
        });
      };
    }

    const summarizer = await self.Summarizer.create(createOptions);
    try {
      return await summarizer.summarize(text);
    } finally {
      if (summarizer && typeof summarizer.destroy === 'function') {
        try {
          summarizer.destroy();
        } catch (_) {
          // ignore destroy errors
        }
      }
    }
  };

  ns.NanoSummarizer = { checkAvailability, summarize };
})();
