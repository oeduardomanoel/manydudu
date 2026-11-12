// Busca na página pública de materiais — só filtra o que já está na tela, nenhuma requisição.
const input = document.getElementById("mt-search");
const cards = [...document.querySelectorAll(".mt-card")];
const count = document.getElementById("mt-count");
const empty = document.getElementById("mt-empty");
const normalize = (value) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

if (input && cards.length) {
  const index = cards.map((card) => normalize(card.dataset.search || ""));
  input.addEventListener("input", () => {
    const terms = normalize(input.value).split(/\s+/).filter(Boolean);
    let shown = 0;
    cards.forEach((card, i) => {
      const match = terms.every((term) => index[i].includes(term));
      card.hidden = !match;
      if (match) shown += 1;
    });
    count.textContent = `${shown} ${shown === 1 ? "material" : "materiais"}`;
    empty.hidden = shown > 0;
  });
}
