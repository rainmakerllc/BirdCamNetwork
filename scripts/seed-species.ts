// Run with: npx ts-node --esm scripts/seed-species.ts
// Or: npx tsx scripts/seed-species.ts

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load service account
const serviceAccount = JSON.parse(
  readFileSync(resolve(__dirname, '../config/firebase-service-account.json'), 'utf-8')
);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

const species = [
  // Cardinals & Grosbeaks
  { commonName: 'Northern Cardinal', scientificName: 'Cardinalis cardinalis', family: 'Cardinalidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Rose-breasted Grosbeak', scientificName: 'Pheucticus ludovicianus', family: 'Cardinalidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Blue Grosbeak', scientificName: 'Passerina caerulea', family: 'Cardinalidae', regionCodes: ['NA', 'US-S'] },
  { commonName: 'Indigo Bunting', scientificName: 'Passerina cyanea', family: 'Cardinalidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Painted Bunting', scientificName: 'Passerina ciris', family: 'Cardinalidae', regionCodes: ['NA', 'US-S'] },
  
  // Jays & Crows
  { commonName: 'Blue Jay', scientificName: 'Cyanocitta cristata', family: 'Corvidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Steller\'s Jay', scientificName: 'Cyanocitta stelleri', family: 'Corvidae', regionCodes: ['NA', 'US-W'] },
  { commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos', family: 'Corvidae', regionCodes: ['NA'] },
  { commonName: 'Common Raven', scientificName: 'Corvus corax', family: 'Corvidae', regionCodes: ['NA'] },
  
  // Finches
  { commonName: 'House Finch', scientificName: 'Haemorhous mexicanus', family: 'Fringillidae', regionCodes: ['NA'] },
  { commonName: 'Purple Finch', scientificName: 'Haemorhous purpureus', family: 'Fringillidae', regionCodes: ['NA'] },
  { commonName: 'American Goldfinch', scientificName: 'Spinus tristis', family: 'Fringillidae', regionCodes: ['NA'] },
  { commonName: 'Pine Siskin', scientificName: 'Spinus pinus', family: 'Fringillidae', regionCodes: ['NA'] },
  { commonName: 'Evening Grosbeak', scientificName: 'Coccothraustes vespertinus', family: 'Fringillidae', regionCodes: ['NA'] },
  
  // Chickadees & Titmice
  { commonName: 'Black-capped Chickadee', scientificName: 'Poecile atricapillus', family: 'Paridae', regionCodes: ['NA', 'US-N'] },
  { commonName: 'Carolina Chickadee', scientificName: 'Poecile carolinensis', family: 'Paridae', regionCodes: ['NA', 'US-SE'] },
  { commonName: 'Tufted Titmouse', scientificName: 'Baeolophus bicolor', family: 'Paridae', regionCodes: ['NA', 'US-E'] },
  
  // Nuthatches
  { commonName: 'White-breasted Nuthatch', scientificName: 'Sitta carolinensis', family: 'Sittidae', regionCodes: ['NA'] },
  { commonName: 'Red-breasted Nuthatch', scientificName: 'Sitta canadensis', family: 'Sittidae', regionCodes: ['NA'] },
  
  // Woodpeckers
  { commonName: 'Downy Woodpecker', scientificName: 'Dryobates pubescens', family: 'Picidae', regionCodes: ['NA'] },
  { commonName: 'Hairy Woodpecker', scientificName: 'Dryobates villosus', family: 'Picidae', regionCodes: ['NA'] },
  { commonName: 'Red-bellied Woodpecker', scientificName: 'Melanerpes carolinus', family: 'Picidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Red-headed Woodpecker', scientificName: 'Melanerpes erythrocephalus', family: 'Picidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Northern Flicker', scientificName: 'Colaptes auratus', family: 'Picidae', regionCodes: ['NA'] },
  { commonName: 'Pileated Woodpecker', scientificName: 'Dryocopus pileatus', family: 'Picidae', regionCodes: ['NA'] },
  
  // Sparrows
  { commonName: 'House Sparrow', scientificName: 'Passer domesticus', family: 'Passeridae', regionCodes: ['NA', 'EU'] },
  { commonName: 'Song Sparrow', scientificName: 'Melospiza melodia', family: 'Passerellidae', regionCodes: ['NA'] },
  { commonName: 'White-throated Sparrow', scientificName: 'Zonotrichia albicollis', family: 'Passerellidae', regionCodes: ['NA'] },
  { commonName: 'White-crowned Sparrow', scientificName: 'Zonotrichia leucophrys', family: 'Passerellidae', regionCodes: ['NA'] },
  { commonName: 'Chipping Sparrow', scientificName: 'Spizella passerina', family: 'Passerellidae', regionCodes: ['NA'] },
  { commonName: 'Dark-eyed Junco', scientificName: 'Junco hyemalis', family: 'Passerellidae', regionCodes: ['NA'] },
  
  // Thrushes
  { commonName: 'American Robin', scientificName: 'Turdus migratorius', family: 'Turdidae', regionCodes: ['NA'] },
  { commonName: 'Eastern Bluebird', scientificName: 'Sialia sialis', family: 'Turdidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Western Bluebird', scientificName: 'Sialia mexicana', family: 'Turdidae', regionCodes: ['NA', 'US-W'] },
  
  // Wrens
  { commonName: 'Carolina Wren', scientificName: 'Thryothorus ludovicianus', family: 'Troglodytidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'House Wren', scientificName: 'Troglodytes aedon', family: 'Troglodytidae', regionCodes: ['NA'] },
  
  // Mockingbirds & Thrashers
  { commonName: 'Northern Mockingbird', scientificName: 'Mimus polyglottos', family: 'Mimidae', regionCodes: ['NA'] },
  { commonName: 'Gray Catbird', scientificName: 'Dumetella carolinensis', family: 'Mimidae', regionCodes: ['NA'] },
  { commonName: 'Brown Thrasher', scientificName: 'Toxostoma rufum', family: 'Mimidae', regionCodes: ['NA', 'US-E'] },
  
  // Doves
  { commonName: 'Mourning Dove', scientificName: 'Zenaida macroura', family: 'Columbidae', regionCodes: ['NA'] },
  { commonName: 'Rock Pigeon', scientificName: 'Columba livia', family: 'Columbidae', regionCodes: ['NA', 'EU'] },
  
  // Hummingbirds
  { commonName: 'Ruby-throated Hummingbird', scientificName: 'Archilochus colubris', family: 'Trochilidae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Anna\'s Hummingbird', scientificName: 'Calypte anna', family: 'Trochilidae', regionCodes: ['NA', 'US-W'] },
  { commonName: 'Rufous Hummingbird', scientificName: 'Selasphorus rufus', family: 'Trochilidae', regionCodes: ['NA', 'US-W'] },
  
  // Blackbirds & Orioles
  { commonName: 'Red-winged Blackbird', scientificName: 'Agelaius phoeniceus', family: 'Icteridae', regionCodes: ['NA'] },
  { commonName: 'Common Grackle', scientificName: 'Quiscalus quiscula', family: 'Icteridae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Brown-headed Cowbird', scientificName: 'Molothrus ater', family: 'Icteridae', regionCodes: ['NA'] },
  { commonName: 'Baltimore Oriole', scientificName: 'Icterus galbula', family: 'Icteridae', regionCodes: ['NA', 'US-E'] },
  { commonName: 'Orchard Oriole', scientificName: 'Icterus spurius', family: 'Icteridae', regionCodes: ['NA', 'US-E'] },
  
  // Starlings
  { commonName: 'European Starling', scientificName: 'Sturnus vulgaris', family: 'Sturnidae', regionCodes: ['NA', 'EU'] },
  
  // Waxwings
  { commonName: 'Cedar Waxwing', scientificName: 'Bombycilla cedrorum', family: 'Bombycillidae', regionCodes: ['NA'] },
  
  // Hawks
  { commonName: 'Cooper\'s Hawk', scientificName: 'Accipiter cooperii', family: 'Accipitridae', regionCodes: ['NA'] },
  { commonName: 'Sharp-shinned Hawk', scientificName: 'Accipiter striatus', family: 'Accipitridae', regionCodes: ['NA'] },
  { commonName: 'Red-tailed Hawk', scientificName: 'Buteo jamaicensis', family: 'Accipitridae', regionCodes: ['NA'] },
];

async function seed() {
  console.log(`Seeding ${species.length} species...`);
  
  const batch = db.batch();
  
  for (const s of species) {
    const id = s.commonName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    const ref = db.collection('species').doc(id);
    batch.set(ref, s);
  }
  
  await batch.commit();
  console.log('✅ Species seeded successfully!');
}

seed().catch(console.error);
