export interface StoreConfig {
  name: string;
  address: string;
  tradingHours: string;
  staffContact: string;
  googleMapsLink?: string;
  contactPhoneNumber?: string;
  actionNotes?: string;
  bookingLink?: string;
  did: string;
}

export const STORE_MAPPING: Record<string, StoreConfig> = {
  '0872286100': {
    name: 'Marion',
    address: 'Kiosk 204 Westfield, 297 Diagonal Rd, Oaklands Park SA 5046',
    tradingHours:
      'Mon-Wed & Fri 9:00am–5:30pm, Thu 9:00am–9:00pm, Sat 9:00am–5:00pm, Sun 11:00am–5:00pm',
    googleMapsLink: 'https://maps.app.goo.gl/vuY9MrjQ4QbBPcJSA',
    staffContact: '0872286100',
    contactPhoneNumber: '0423 707 295',
    actionNotes: 'Direct to Mobile Van',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '0872286100',
  },
  '09821200012062': {
    name: 'Enex Perth',
    address:
      'Shop ST105 Level 1 Enex Perth, 100 St Georges Terrace, Perth WA 6000',
    tradingHours: 'Mon-Fri 9:00am–6:00pm, Sat: close, Sun: close',
    googleMapsLink: '',
    staffContact: '61892260988',
    contactPhoneNumber: '0401 709 952',
    actionNotes: 'Direct to Mobile Van',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '09821200012062',
  },
  '61892260988': {
    name: 'Enex Perth',
    address:
      'Shop ST105 Level 1 Enex Perth, 100 St Georges Terrace, Perth WA 6000',
    tradingHours: 'Mon-Fri 9:00am–6:00pm, Sat: close, Sun: close',
    googleMapsLink: '',
    staffContact: '61892260988',
    contactPhoneNumber: '0401 709 952',
    actionNotes: 'Direct to Mobile Van',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '61892260988',
  },
  '61370360442': {
    name: 'Traralgon',
    address: 'Traralgon Centre Plaza, 166-188 Franklin St, Traralgon VIC 3844',
    tradingHours:
      'Mon-Wed 9:00am–5:30pm, Thu-Fri 9:00am–9:00pm, Sat 10:00am–4:00pm, Sun 9:00am–5:30pm',
    googleMapsLink: '',
    staffContact: '61370360442',
    contactPhoneNumber: '02 9521 9100',
    actionNotes: 'No Mobile Van — Direct to Minit HQ Reception',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '61370360442',
  },
  '09821200012620': {
    name: 'Traralgon',
    address: 'Traralgon Centre Plaza, 166-188 Franklin St, Traralgon VIC 3844',
    tradingHours:
      'Mon-Wed 9:00am–5:30pm, Thu-Fri 9:00am–9:00pm, Sat 10:00am–4:00pm, Sun 9:00am–5:30pm',
    googleMapsLink: '',
    staffContact: '61370360442',
    contactPhoneNumber: '02 9521 9100',
    actionNotes: 'No Mobile Van — Direct to Minit HQ Reception',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '09821200012620',
  },
  '0370360236': {
    name: 'TOK H',
    address: 'Shop 9, Tok H Centre, 459-465 Toorak Rd, Toorak VIC 3142',
    tradingHours:
      'Mon-Fri 9:00am–5:30pm, Sat 9:00am–6:00pm, Sun: 10:00 AM – 5:00 PM',
    googleMapsLink: '',
    staffContact: '0370360236',
    contactPhoneNumber: '0499 270 801',
    actionNotes: 'Direct to Mobile Van',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '0370360236',
  },
  '0863652926': {
    name: 'Dianella',
    address:
      'Kiosk KI001, Dianella Plaza, 366 Grand Promenade, Dianella WA 6059',
    tradingHours:
      'Mon-Wed & Fri 9:00am–5:30pm, Thu 9:00am–9:00pm, Sat 9:00am–5:00pm, Sun 11:00am–5:00pm',
    googleMapsLink: '',
    staffContact: '0863652926',
    contactPhoneNumber: '0401 709 952',
    actionNotes: 'Direct to Mobile Van',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '0863652926',
  },
  '0861868180': {
    name: 'The Mezz, Mt Hawthorn',
    address:
      'TKiosk 1/148 Scarborough Beach Rd, The Hawaiian Mezz, Mount Hawthorn WA 6016',
    tradingHours: 'Mon-Fri 9:00am–5:30pm, Sat 9:00am–5:00pm, Sun: close',
    googleMapsLink: '',
    staffContact: '0861868180',
    contactPhoneNumber: '0401 709 952',
    actionNotes: 'Direct to Mobile Van',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '0861868180',
  },
  '0738214854': {
    name: 'Cleveland',
    address: 'Shop K02/91 Middle St, Cleveland Central, Cleveland QLD 4163',
    tradingHours:
      'Mon-Wed & Fri 9:00am–5:30pm, Thu 9:00am–6:00pm, Sat 9:00am–5:00pm, Sun 10:00am–4:00pm',
    googleMapsLink: '',
    staffContact: '0738214854',
    contactPhoneNumber: '0738214854',
    actionNotes: 'Direct to Store',
    bookingLink: 'https://misterminit.co/pages/car-keys',
    did: '0738214854',
  },
};
