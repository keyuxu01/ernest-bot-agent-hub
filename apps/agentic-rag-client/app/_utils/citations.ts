/**
 * @description Build a DOM anchor ID for a citation card within one chat message.
 * @param scope Message scope used to avoid ID collisions.
 * @param index Citation number shown in the answer.
 * @returns Stable citation card DOM ID.
 */
const citeAnchorId = (scope: string, index: number) => `kh-cite-${scope}-${index}`;

/**
 * @description Scroll to and briefly highlight a citation card after its inline marker is clicked.
 * This helper intentionally updates DOM classes because scrolling and animation are browser effects.
 * @param scope Message scope containing the citation card.
 * @param index Citation number to focus.
 * @returns Nothing.
 */
const focusCite = (scope: string, index: number): void => {
  const element = document.getElementById(citeAnchorId(scope, index));
  if (!element) return;
  element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  element.classList.remove('flash');
  void element.offsetWidth;
  element.classList.add('flash');
};

export { citeAnchorId, focusCite };
