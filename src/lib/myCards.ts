// Las tarjetas que este teléfono ha abierto, para encontrarlas otra vez desde el inicio aunque no se
// hayan guardado en el Wallet. Solo vive en este navegador.

const KEY = 'sula.cards'

export interface SavedCard {
  id: string
  business: string
  color: string
}

export function savedCards(): SavedCard[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function rememberCard(card: SavedCard) {
  try {
    const rest = savedCards().filter((c) => c.id !== card.id)
    localStorage.setItem(KEY, JSON.stringify([card, ...rest].slice(0, 20)))
  } catch {
    // almacenamiento no disponible: no pasa nada
  }
}
