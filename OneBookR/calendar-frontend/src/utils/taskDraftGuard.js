// ✅ Ett föreslaget (ej bekräftat) uppgiftspass lever bara i Task-sidans
// eget minne tills man trycker "Lägg till i kalender" — stängs/öppnas
// panelen är det redan säkert (se Task.jsx), men lämnar man HELA sidan
// (klickar sig till "1v1 Möte"/"Team" i headern, laddar om, eller skriver
// in en annan URL) försvinner det tyst. App.jsx äger navigationen mellan
// vyer men vet inget om Task-sidans interna state — den här lilla delade
// modulen är bron: Task.jsx talar om när ett förslag finns, App.jsx frågar
// innan den faktiskt byter bort från uppgiftsvyn.
let hasUnsavedDraft = false;
let draftTaskName = null;

export function setTaskDraftState(taskName) {
  hasUnsavedDraft = Boolean(taskName);
  draftTaskName = taskName || null;
}

export function confirmLeavingTaskDraft() {
  if (!hasUnsavedDraft) return true;
  return window.confirm(
    `Du har ett förslag${draftTaskName ? ` för "${draftTaskName}"` : ''} som inte lagts till i kalendern än. ` +
    'Lämnar du sidan nu försvinner det. Lämna ändå?'
  );
}
