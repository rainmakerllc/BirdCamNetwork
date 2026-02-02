import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BirdSpecies } from '@/types';

const speciesRef = collection(db, 'species');

// Get all species
export async function getAllSpecies(): Promise<BirdSpecies[]> {
  const q = query(speciesRef, orderBy('commonName'));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as BirdSpecies[];
}

// Get species by ID
export async function getSpecies(speciesId: string): Promise<BirdSpecies | null> {
  const docRef = doc(db, 'species', speciesId);
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    return { id: docSnap.id, ...docSnap.data() } as BirdSpecies;
  }
  return null;
}

// Search species by name
export async function searchSpecies(searchTerm: string): Promise<BirdSpecies[]> {
  const allSpecies = await getAllSpecies();
  const term = searchTerm.toLowerCase();
  return allSpecies.filter(
    (s) =>
      s.commonName.toLowerCase().includes(term) ||
      s.scientificName.toLowerCase().includes(term)
  );
}

// Get species by region
export async function getSpeciesByRegion(regionCode: string): Promise<BirdSpecies[]> {
  const q = query(
    speciesRef,
    where('regionCodes', 'array-contains', regionCode),
    orderBy('commonName')
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  })) as BirdSpecies[];
}

// Seed initial species data (common NA backyard birds)
export async function seedSpeciesData(): Promise<void> {
  const species: Omit<BirdSpecies, 'id'>[] = [
    { commonName: 'Northern Cardinal', scientificName: 'Cardinalis cardinalis', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Blue Jay', scientificName: 'Cyanocitta cristata', regionCodes: ['NA', 'US-E'] },
    { commonName: 'American Robin', scientificName: 'Turdus migratorius', regionCodes: ['NA'] },
    { commonName: 'House Finch', scientificName: 'Haemorhous mexicanus', regionCodes: ['NA'] },
    { commonName: 'House Sparrow', scientificName: 'Passer domesticus', regionCodes: ['NA', 'EU'] },
    { commonName: 'American Goldfinch', scientificName: 'Spinus tristis', regionCodes: ['NA'] },
    { commonName: 'Black-capped Chickadee', scientificName: 'Poecile atricapillus', regionCodes: ['NA', 'US-N'] },
    { commonName: 'Carolina Chickadee', scientificName: 'Poecile carolinensis', regionCodes: ['NA', 'US-SE'] },
    { commonName: 'Tufted Titmouse', scientificName: 'Baeolophus bicolor', regionCodes: ['NA', 'US-E'] },
    { commonName: 'White-breasted Nuthatch', scientificName: 'Sitta carolinensis', regionCodes: ['NA'] },
    { commonName: 'Red-bellied Woodpecker', scientificName: 'Melanerpes carolinus', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Downy Woodpecker', scientificName: 'Dryobates pubescens', regionCodes: ['NA'] },
    { commonName: 'Hairy Woodpecker', scientificName: 'Dryobates villosus', regionCodes: ['NA'] },
    { commonName: 'Northern Mockingbird', scientificName: 'Mimus polyglottos', regionCodes: ['NA'] },
    { commonName: 'Mourning Dove', scientificName: 'Zenaida macroura', regionCodes: ['NA'] },
    { commonName: 'European Starling', scientificName: 'Sturnus vulgaris', regionCodes: ['NA', 'EU'] },
    { commonName: 'Common Grackle', scientificName: 'Quiscalus quiscula', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Red-winged Blackbird', scientificName: 'Agelaius phoeniceus', regionCodes: ['NA'] },
    { commonName: 'Brown-headed Cowbird', scientificName: 'Molothrus ater', regionCodes: ['NA'] },
    { commonName: 'Dark-eyed Junco', scientificName: 'Junco hyemalis', regionCodes: ['NA'] },
    { commonName: 'Song Sparrow', scientificName: 'Melospiza melodia', regionCodes: ['NA'] },
    { commonName: 'White-throated Sparrow', scientificName: 'Zonotrichia albicollis', regionCodes: ['NA'] },
    { commonName: 'Chipping Sparrow', scientificName: 'Spizella passerina', regionCodes: ['NA'] },
    { commonName: 'Eastern Bluebird', scientificName: 'Sialia sialis', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Ruby-throated Hummingbird', scientificName: 'Archilochus colubris', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Anna\'s Hummingbird', scientificName: 'Calypte anna', regionCodes: ['NA', 'US-W'] },
    { commonName: 'American Crow', scientificName: 'Corvus brachyrhynchos', regionCodes: ['NA'] },
    { commonName: 'Baltimore Oriole', scientificName: 'Icterus galbula', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Cedar Waxwing', scientificName: 'Bombycilla cedrorum', regionCodes: ['NA'] },
    { commonName: 'Purple Finch', scientificName: 'Haemorhous purpureus', regionCodes: ['NA'] },
    { commonName: 'Pine Siskin', scientificName: 'Spinus pinus', regionCodes: ['NA'] },
    { commonName: 'Evening Grosbeak', scientificName: 'Coccothraustes vespertinus', regionCodes: ['NA'] },
    { commonName: 'Rose-breasted Grosbeak', scientificName: 'Pheucticus ludovicianus', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Indigo Bunting', scientificName: 'Passerina cyanea', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Painted Bunting', scientificName: 'Passerina ciris', regionCodes: ['NA', 'US-S'] },
    { commonName: 'Carolina Wren', scientificName: 'Thryothorus ludovicianus', regionCodes: ['NA', 'US-E'] },
    { commonName: 'House Wren', scientificName: 'Troglodytes aedon', regionCodes: ['NA'] },
    { commonName: 'Gray Catbird', scientificName: 'Dumetella carolinensis', regionCodes: ['NA'] },
    { commonName: 'Brown Thrasher', scientificName: 'Toxostoma rufum', regionCodes: ['NA', 'US-E'] },
    { commonName: 'Northern Flicker', scientificName: 'Colaptes auratus', regionCodes: ['NA'] },
    { commonName: 'Pileated Woodpecker', scientificName: 'Dryocopus pileatus', regionCodes: ['NA'] },
    { commonName: 'Cooper\'s Hawk', scientificName: 'Accipiter cooperii', regionCodes: ['NA'] },
    { commonName: 'Sharp-shinned Hawk', scientificName: 'Accipiter striatus', regionCodes: ['NA'] },
    { commonName: 'Red-tailed Hawk', scientificName: 'Buteo jamaicensis', regionCodes: ['NA'] },
    { commonName: 'Wild Turkey', scientificName: 'Meleagris gallopavo', regionCodes: ['NA'] },
  ];

  for (const s of species) {
    const id = s.commonName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    await setDoc(doc(db, 'species', id), s);
  }
}

// Common species for quick selection
export const COMMON_SPECIES = [
  'northern-cardinal',
  'blue-jay',
  'american-robin',
  'house-finch',
  'american-goldfinch',
  'black-capped-chickadee',
  'tufted-titmouse',
  'mourning-dove',
  'downy-woodpecker',
  'white-breasted-nuthatch',
];
