import type { Document, PopulatedDoc, Schema } from 'mongoose';

export type Populated<T> = PopulatedDoc<Document<Schema.Types.ObjectId> & T>;
