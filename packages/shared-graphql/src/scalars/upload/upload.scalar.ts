import GraphQLUpload from 'graphql-upload/GraphQLUpload.mjs';
import { createScalarFrom } from '../custom/utils';

export const UPLOAD_SCALAR = {
	Upload: createScalarFrom(GraphQLUpload as any, { name: 'Upload' }),
};
