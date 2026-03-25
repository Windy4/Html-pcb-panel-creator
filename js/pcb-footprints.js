/**
 * Built-in PCB footprint definitions.
 * Each footprint pin uses relCol/relRow relative to the module origin (top-left).
 */
const BUILTIN_FOOTPRINTS = [
  {
    id: 'DIP-4',
    name: 'DIP-4',
    description: '4-pin DIP, 0.3" wide',
    cols: 2, rows: 2,
    pins: [
      { num: 1, name: 'Pin1', relCol: 0, relRow: 0 },
      { num: 2, name: 'Pin2', relCol: 0, relRow: 1 },
      { num: 3, name: 'Pin3', relCol: 1, relRow: 1 },
      { num: 4, name: 'Pin4', relCol: 1, relRow: 0 }
    ]
  },
  {
    id: 'DIP-8',
    name: 'DIP-8',
    description: '8-pin DIP (e.g. 555, LM358)',
    cols: 2, rows: 4,
    pins: [
      { num: 1, name: 'Pin1', relCol: 0, relRow: 0 },
      { num: 2, name: 'Pin2', relCol: 0, relRow: 1 },
      { num: 3, name: 'Pin3', relCol: 0, relRow: 2 },
      { num: 4, name: 'GND',  relCol: 0, relRow: 3 },
      { num: 5, name: 'Pin5', relCol: 1, relRow: 3 },
      { num: 6, name: 'Pin6', relCol: 1, relRow: 2 },
      { num: 7, name: 'Pin7', relCol: 1, relRow: 1 },
      { num: 8, name: 'VCC',  relCol: 1, relRow: 0 }
    ]
  },
  {
    id: 'DIP-14',
    name: 'DIP-14',
    description: '14-pin DIP (e.g. 74xx, LM324)',
    cols: 2, rows: 7,
    pins: [
      { num:  1, name: 'Pin1',  relCol: 0, relRow: 0 },
      { num:  2, name: 'Pin2',  relCol: 0, relRow: 1 },
      { num:  3, name: 'Pin3',  relCol: 0, relRow: 2 },
      { num:  4, name: 'Pin4',  relCol: 0, relRow: 3 },
      { num:  5, name: 'Pin5',  relCol: 0, relRow: 4 },
      { num:  6, name: 'Pin6',  relCol: 0, relRow: 5 },
      { num:  7, name: 'GND',   relCol: 0, relRow: 6 },
      { num:  8, name: 'Pin8',  relCol: 1, relRow: 6 },
      { num:  9, name: 'Pin9',  relCol: 1, relRow: 5 },
      { num: 10, name: 'Pin10', relCol: 1, relRow: 4 },
      { num: 11, name: 'Pin11', relCol: 1, relRow: 3 },
      { num: 12, name: 'Pin12', relCol: 1, relRow: 2 },
      { num: 13, name: 'Pin13', relCol: 1, relRow: 1 },
      { num: 14, name: 'VCC',   relCol: 1, relRow: 0 }
    ]
  },
  {
    id: 'DIP-16',
    name: 'DIP-16',
    description: '16-pin DIP (e.g. 74xx, PIC)',
    cols: 2, rows: 8,
    pins: [
      { num:  1, name: 'Pin1',  relCol: 0, relRow: 0 },
      { num:  2, name: 'Pin2',  relCol: 0, relRow: 1 },
      { num:  3, name: 'Pin3',  relCol: 0, relRow: 2 },
      { num:  4, name: 'Pin4',  relCol: 0, relRow: 3 },
      { num:  5, name: 'Pin5',  relCol: 0, relRow: 4 },
      { num:  6, name: 'Pin6',  relCol: 0, relRow: 5 },
      { num:  7, name: 'Pin7',  relCol: 0, relRow: 6 },
      { num:  8, name: 'GND',   relCol: 0, relRow: 7 },
      { num:  9, name: 'Pin9',  relCol: 1, relRow: 7 },
      { num: 10, name: 'Pin10', relCol: 1, relRow: 6 },
      { num: 11, name: 'Pin11', relCol: 1, relRow: 5 },
      { num: 12, name: 'Pin12', relCol: 1, relRow: 4 },
      { num: 13, name: 'Pin13', relCol: 1, relRow: 3 },
      { num: 14, name: 'Pin14', relCol: 1, relRow: 2 },
      { num: 15, name: 'Pin15', relCol: 1, relRow: 1 },
      { num: 16, name: 'VCC',   relCol: 1, relRow: 0 }
    ]
  },
  {
    id: 'SIP-3',
    name: 'SIP-3',
    description: 'Single Inline 3-pin (transistor)',
    cols: 3, rows: 1,
    pins: [
      { num: 1, name: 'Base',      relCol: 0, relRow: 0 },
      { num: 2, name: 'Collector', relCol: 1, relRow: 0 },
      { num: 3, name: 'Emitter',   relCol: 2, relRow: 0 }
    ]
  },
  {
    id: 'RESISTOR',
    name: 'Resistor',
    description: 'Axial resistor / 2-pin component',
    cols: 3, rows: 1,
    pins: [
      { num: 1, name: 'A', relCol: 0, relRow: 0 },
      { num: 2, name: 'K', relCol: 2, relRow: 0 }
    ]
  },
  {
    id: 'CAP-2',
    name: 'Capacitor',
    description: 'Electrolytic/ceramic capacitor',
    cols: 1, rows: 2,
    pins: [
      { num: 1, name: '+', relCol: 0, relRow: 0 },
      { num: 2, name: '-', relCol: 0, relRow: 1 }
    ]
  },
  {
    id: 'LED-2',
    name: 'LED',
    description: '2-pin LED',
    cols: 1, rows: 2,
    pins: [
      { num: 1, name: 'A', relCol: 0, relRow: 0 },
      { num: 2, name: 'K', relCol: 0, relRow: 1 }
    ]
  },
  {
    id: 'CONN-2',
    name: 'Connector 2P',
    description: '2-pin connector / header',
    cols: 2, rows: 1,
    pins: [
      { num: 1, name: 'Pin1', relCol: 0, relRow: 0 },
      { num: 2, name: 'Pin2', relCol: 1, relRow: 0 }
    ]
  },
  {
    id: 'CONN-4',
    name: 'Connector 4P',
    description: '4-pin connector / header',
    cols: 4, rows: 1,
    pins: [
      { num: 1, name: 'Pin1', relCol: 0, relRow: 0 },
      { num: 2, name: 'Pin2', relCol: 1, relRow: 0 },
      { num: 3, name: 'Pin3', relCol: 2, relRow: 0 },
      { num: 4, name: 'Pin4', relCol: 3, relRow: 0 }
    ]
  },
  {
    id: 'CONN-6',
    name: 'Connector 6P',
    description: '6-pin connector / header',
    cols: 6, rows: 1,
    pins: [
      { num: 1, name: 'Pin1', relCol: 0, relRow: 0 },
      { num: 2, name: 'Pin2', relCol: 1, relRow: 0 },
      { num: 3, name: 'Pin3', relCol: 2, relRow: 0 },
      { num: 4, name: 'Pin4', relCol: 3, relRow: 0 },
      { num: 5, name: 'Pin5', relCol: 4, relRow: 0 },
      { num: 6, name: 'Pin6', relCol: 5, relRow: 0 }
    ]
  },
  {
    id: 'TO-92',
    name: 'TO-92',
    description: 'TO-92 transistor / LM35 / 7805',
    cols: 3, rows: 1,
    pins: [
      { num: 1, name: 'Pin1', relCol: 0, relRow: 0 },
      { num: 2, name: 'Pin2', relCol: 1, relRow: 0 },
      { num: 3, name: 'Pin3', relCol: 2, relRow: 0 }
    ]
  },
  {
    id: 'ARDUINO-UNO',
    name: 'Arduino Uno',
    description: 'Arduino Uno pin header (simplified)',
    cols: 1, rows: 20,
    pins: [
      { num:  1, name: 'D0/RX',  relCol: 0, relRow:  0 },
      { num:  2, name: 'D1/TX',  relCol: 0, relRow:  1 },
      { num:  3, name: 'D2',     relCol: 0, relRow:  2 },
      { num:  4, name: 'D3~',    relCol: 0, relRow:  3 },
      { num:  5, name: 'D4',     relCol: 0, relRow:  4 },
      { num:  6, name: 'D5~',    relCol: 0, relRow:  5 },
      { num:  7, name: 'D6~',    relCol: 0, relRow:  6 },
      { num:  8, name: 'D7',     relCol: 0, relRow:  7 },
      { num:  9, name: 'D8',     relCol: 0, relRow:  8 },
      { num: 10, name: 'D9~',    relCol: 0, relRow:  9 },
      { num: 11, name: 'D10~',   relCol: 0, relRow: 10 },
      { num: 12, name: 'D11~',   relCol: 0, relRow: 11 },
      { num: 13, name: 'D12',    relCol: 0, relRow: 12 },
      { num: 14, name: 'D13/LED',relCol: 0, relRow: 13 },
      { num: 15, name: 'A0',     relCol: 0, relRow: 14 },
      { num: 16, name: 'A1',     relCol: 0, relRow: 15 },
      { num: 17, name: 'A2',     relCol: 0, relRow: 16 },
      { num: 18, name: 'A3',     relCol: 0, relRow: 17 },
      { num: 19, name: 'A4/SDA', relCol: 0, relRow: 18 },
      { num: 20, name: 'A5/SCL', relCol: 0, relRow: 19 }
    ]
  }
];
