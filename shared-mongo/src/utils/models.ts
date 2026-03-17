import type { Document, ObjectId, PopulatedDoc } from 'mongoose';

export type Populated<T> = PopulatedDoc<Document<ObjectId> & T>;
